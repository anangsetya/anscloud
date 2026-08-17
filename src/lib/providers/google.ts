import { google } from 'googleapis';
import type { DriveAccount } from '@prisma/client';
import { db } from '@/lib/db';

/**
 * GoogleDriveProvider — stores files in the user's real Google Drive.
 *
 * Used when provider='google' AND the account has valid OAuth tokens.
 *
 * Files are uploaded with multipart upload to the user's Drive (either to
 * the root or to the folder specified by `driveRootFolderId`).
 *
 * The `physicalFileId` stored in our DB is the Google Drive file ID returned
 * by the API. We use it to download or delete the file later.
 *
 * Quota: fetched live from the Drive API (`about.get` with `fields=storageQuota`)
 * — see `fetchGoogleDriveQuota()` below.
 */

const SCOPES = ['https://www.googleapis.com/auth/drive'];

type AccountWithTokens = DriveAccount & {
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
};

function assertHasTokens(account: AccountWithTokens) {
  if (!account.accessToken || !account.refreshToken) {
    throw new Error(
      `Akun Google "${account.displayName}" belum punya token OAuth. Putuskan dan hubungkan ulang akun ini.`
    );
  }
}

/**
 * Get an authenticated OAuth2 client for the given account.
 * Auto-refreshes the access token if it's expired (using the refresh token).
 */
async function getAuthenticatedClient(account: AccountWithTokens) {
  assertHasTokens(account);

  // Compute public URL for redirect_uri (not used by API calls, but required by OAuth2 constructor).
  const publicUrl = process.env.ANSCLOUD_PUBLIC_URL || 'http://localhost:3000';
  const redirectUri = `${publicUrl}/api/auth/google/callback`;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );

  oauth2Client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
    expiry_date: account.tokenExpiresAt ? account.tokenExpiresAt.getTime() : undefined,
  });

  // The googleapis library auto-refreshes the access token when it's expired
  // and fires the 'tokens' event with the new credentials. We persist them.
  oauth2Client.on('tokens', async (tokens) => {
    const update: {
      accessToken?: string;
      refreshToken?: string;
      tokenExpiresAt?: Date;
    } = {};
    if (tokens.access_token) update.accessToken = tokens.access_token;
    if (tokens.refresh_token) update.refreshToken = tokens.refresh_token;
    if (tokens.expiry_date) update.tokenExpiresAt = new Date(tokens.expiry_date);
    if (Object.keys(update).length > 0) {
      await db.driveAccount.update({ where: { id: account.id }, data: update });
    }
  });

  return oauth2Client;
}

/**
 * Upload a file to the user's Google Drive.
 * Returns the Google Drive file ID (used as `physicalFileId`).
 */
export async function googleDriveStoreFile(
  account: AccountWithTokens,
  file: { name: string; mimeType: string; sizeBytes: bigint; data: Buffer }
): Promise<{ physicalFileId: string }> {
  const auth = await getAuthenticatedClient(account);
  const drive = google.drive({ version: 'v3', auth });

  const res = await drive.files.create({
    requestBody: {
      name: file.name,
      // If the account has a root folder configured, put the file inside it.
      ...(account.driveRootFolderId
        ? { parents: [account.driveRootFolderId] }
        : {}),
    },
    media: {
      mimeType: file.mimeType,
      body: file.data,
    },
    fields: 'id',
  });

  if (!res.data.id) {
    throw new Error('Google Drive API tidak mengembalikan file ID.');
  }
  return { physicalFileId: res.data.id };
}

/**
 * Download a file's bytes from Google Drive.
 * Note: for very large files, you'd want to stream this instead of buffering.
 */
export async function googleDriveReadFile(
  account: AccountWithTokens,
  physicalFileId: string
): Promise<Buffer> {
  const auth = await getAuthenticatedClient(account);
  const drive = google.drive({ version: 'v3', auth });

  const res = await drive.files.get(
    { fileId: physicalFileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data as ArrayBuffer);
}

/**
 * Delete a file from Google Drive.
 */
export async function googleDriveDeleteFile(
  account: AccountWithTokens,
  physicalFileId: string
): Promise<void> {
  const auth = await getAuthenticatedClient(account);
  const drive = google.drive({ version: 'v3', auth });

  try {
    await drive.files.delete({ fileId: physicalFileId });
  } catch (err: unknown) {
    // If the file is already gone on Drive, treat as success (idempotent).
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: number }).code === 404
    ) {
      return;
    }
    throw err;
  }
}

/**
 * Fetch the live quota from Google Drive API.
 * Returns { totalBytes, usedBytes }.
 *
 * Drive's storageQuota reflects the user's total Google account storage
 * (Drive + Gmail + Photos) and usage across all of them.
 */
export async function fetchGoogleDriveQuota(
  account: AccountWithTokens
): Promise<{ totalBytes: bigint; usedBytes: bigint }> {
  const auth = await getAuthenticatedClient(account);
  const drive = google.drive({ version: 'v3', auth });

  const res = await drive.about.get({
    fields: 'storageQuota(limit,usage)',
  });

  const quota = res.data.storageQuota;
  if (!quota) {
    throw new Error('Google Drive API tidak mengembalikan storageQuota.');
  }
  return {
    totalBytes: BigInt(quota.limit ?? 0),
    usedBytes: BigInt(quota.usage ?? 0),
  };
}

/**
 * List files in the user's Google Drive (not trashed).
 * Returns up to `pageSize` files (max 1000 per Drive API).
 *
 * By default, lists ALL files in the user's Drive (excluding trashed).
 * If `parentFolderId` is set, only lists files inside that folder.
 *
 * Each file includes: id, name, mimeType, size, modifiedTime, createdTime.
 */
export async function listGoogleDriveFiles(
  account: AccountWithTokens,
  options: { parentFolderId?: string | null; pageSize?: number } = {}
): Promise<Array<{
  id: string;
  name: string;
  mimeType: string;
  size: bigint;
  modifiedTime: Date;
  createdTime: Date;
  parents: string[];
}>> {
  const auth = await getAuthenticatedClient(account);
  const drive = google.drive({ version: 'v3', auth });

  // Build query: not trashed; optionally filter by parent.
  let q = "trashed = false";
  if (options.parentFolderId) {
    q += ` and '${options.parentFolderId}' in parents`;
  }

  const res = await drive.files.list({
    q,
    pageSize: options.pageSize ?? 200,
    fields: 'files(id,name,mimeType,size,modifiedTime,createdTime,parents)',
    orderBy: 'modifiedTime desc',
  });

  const files = res.data.files ?? [];
  return files.map((f) => ({
    id: f.id ?? '',
    name: f.name ?? 'unnamed',
    mimeType: f.mimeType ?? 'application/octet-stream',
    size: BigInt(f.size ?? '0'),
    modifiedTime: new Date(f.modifiedTime ?? Date.now()),
    createdTime: new Date(f.createdTime ?? Date.now()),
    parents: (f.parents as string[]) ?? [],
  }));
}

/**
 * Find or create a folder in the user's Drive by name.
 * Searches at the Drive root (or inside parentFolderId if given).
 * Returns the folder's Google Drive file ID.
 */
export async function findOrCreateFolder(
  account: AccountWithTokens,
  folderName: string,
  parentFolderId?: string | null
): Promise<string> {
  const auth = await getAuthenticatedClient(account);
  const drive = google.drive({ version: 'v3', auth });

  // Search for existing folder with this name (not trashed).
  let q = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName.replace(/'/g, "\\'")}' and trashed = false`;
  if (parentFolderId) {
    q += ` and '${parentFolderId}' in parents`;
  } else {
    // Folders at root have no parents (or 'root' as parent in older API versions).
    // We'll just match by name across the whole Drive to keep this simple.
  }

  const existing = await drive.files.list({
    q,
    fields: 'files(id,name)',
    pageSize: 1,
  });

  if (existing.data.files && existing.data.files.length > 0 && existing.data.files[0].id) {
    return existing.data.files[0].id;
  }

  // Create the folder.
  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentFolderId ? { parents: [parentFolderId] } : {}),
    },
    fields: 'id',
  });

  if (!created.data.id) {
    throw new Error(`Gagal membuat folder "${folderName}" di Google Drive.`);
  }
  return created.data.id;
}

/**
 * Move a file to a different parent folder on Google Drive.
 *
 * Uses the `update` API with `addParents` and `removeParents` parameters.
 * This is a metadata-only operation — the file's bytes are NOT re-uploaded.
 *
 * Note: a file can have multiple parents in Drive. We remove ALL existing
 * parents and add the target folder as the new single parent.
 */
export async function moveFileToFolder(
  account: AccountWithTokens,
  fileId: string,
  newParentFolderId: string,
  previousParents: string[]
): Promise<void> {
  const auth = await getAuthenticatedClient(account);
  const drive = google.drive({ version: 'v3', auth });

  await drive.files.update({
    fileId,
    addParents: newParentFolderId,
    removeParents: previousParents.join(','),
    fields: 'id,parents',
  });
}

export { SCOPES };

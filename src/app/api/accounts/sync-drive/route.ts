// File: src/app/api/accounts/sync-drive/route.ts
// REPLACE file lama dengan ini — sekarang juga menyinkronkan struktur folder dari Google Drive.

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { db } from '@/lib/db';
import { requireUserId } from '@/lib/session';
import { logActivity } from '@/lib/activity';

// Google-native doc types that cannot be downloaded as regular blobs.
const GOOGLE_DOC_MIMETYPES = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.drawing',
  'application/vnd.google-apps.script',
  'application/vnd.google-apps.form',
  'application/vnd.google-apps.site',
  'application/vnd.google-apps.map',
]);

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/**
 * POST /api/accounts/sync-drive
 * Body: { accountId: string }
 *
 * Lists ALL files AND folders from the connected Google Drive (paginated),
 * then upserts them into the VirtualFile / VirtualFolder tables.
 *
 * Folder sync:
 *   1. Fetch all folders (mimeType = folder, trashed = false)
 *   2. Build a map: GoogleDriveFolderId → VirtualFolderId
 *   3. Create VirtualFolder entries preserving parent-child hierarchy
 *      (parent folders before children via topological sort)
 *   4. When creating VirtualFile entries, set folderId based on
 *      the file's parents[0] mapped through the folder map
 *
 * File sync (unchanged):
 *   - Skips Google-native docs (Sheets, Docs, Slides) because they
 *     cannot be downloaded as regular blobs via the Drive API.
 *   - Uses upsert by (userId, physicalFileId) so re-sync is safe.
 *   - Max 10 000 files per sync (Vercel serverless timeout guard).
 */
export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const accountId = String(body.accountId ?? '');

  if (!accountId) {
    return NextResponse.json({ error: 'accountId wajib diisi.' }, { status: 400 });
  }

  // ── Validate account ─────────────────────────────────────────
  const account = await db.driveAccount.findFirst({
    where: { id: accountId, userId },
  });
  if (!account) {
    return NextResponse.json({ error: 'Akun tidak ditemukan.' }, { status: 404 });
  }
  if (account.provider !== 'google') {
    return NextResponse.json(
      { error: 'Sinkronisasi hanya untuk akun Google Drive.' },
      { status: 400 }
    );
  }
  if (!account.accessToken || !account.refreshToken) {
    return NextResponse.json(
      { error: 'Akun ini tidak punya token OAuth. Hubungkan ulang.' },
      { status: 400 }
    );
  }

  // ── Build authenticated Drive client ─────────────────────────
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

  // Persist refreshed tokens
  oauth2Client.on('tokens', async (tokens) => {
    const data: Record<string, unknown> = {};
    if (tokens.access_token) data.accessToken = tokens.access_token;
    if (tokens.refresh_token) data.refreshToken = tokens.refresh_token;
    if (tokens.expiry_date) data.tokenExpiresAt = new Date(tokens.expiry_date);
    if (Object.keys(data).length > 0) {
      await db.driveAccount.update({ where: { id: account.id }, data });
    }
  });

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  // ── Type for Drive API file/folder entries ────────────────────
  interface DriveEntry {
    id?: string;
    name?: string;
    mimeType?: string;
    size?: string;
    modifiedTime?: string;
    parents?: string[];
  }

  // ══════════════════════════════════════════════════════════════
  // PHASE 1: Fetch all FOLDERS from Google Drive
  // ══════════════════════════════════════════════════════════════
  let allFolders: Required<Pick<DriveEntry, 'id' | 'name' | 'parents'>>[] = [];
  let folderPageToken: string | undefined = undefined;
  const MAX_FOLDERS = 10_000;

  try {
    do {
      const res = await drive.files.list({
        q: `mimeType = '${FOLDER_MIME}' and trashed = false`,
        pageSize: 1000,
        pageToken: folderPageToken,
        fields: 'nextPageToken,files(id,name,parents)',
        orderBy: 'modifiedTime desc',
      });

      const folders = (res.data.files ?? []).filter(
        (f): f is Required<Pick<DriveEntry, 'id' | 'name' | 'parents'>> =>
          !!f.id && !!f.name
      );
      allFolders.push(...folders);
      folderPageToken = res.data.nextPageToken || undefined;

      if (allFolders.length >= MAX_FOLDERS) break;
    } while (folderPageToken);
  } catch (err) {
    return NextResponse.json(
      { error: `Gagal mengambil daftar folder: ${err instanceof Error ? err.message : 'Unknown'}` },
      { status: 500 }
    );
  }

  // ══════════════════════════════════════════════════════════════
  // PHASE 2: Fetch all FILES from Google Drive
  // ══════════════════════════════════════════════════════════════
  let allFiles: DriveEntry[] = [];
  let filePageToken: string | undefined = undefined;
  const MAX_FILES = 10_000;

  try {
    do {
      const res = await drive.files.list({
        q: 'trashed = false',
        pageSize: 1000,
        pageToken: filePageToken,
        fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,parents)',
        orderBy: 'modifiedTime desc',
      });

      const files = res.data.files ?? [];
      allFiles.push(...files);
      filePageToken = res.data.nextPageToken || undefined;

      if (allFiles.length >= MAX_FILES) break;
    } while (filePageToken);
  } catch (err) {
    return NextResponse.json(
      { error: `Gagal mengambil daftar file: ${err instanceof Error ? err.message : 'Unknown'}` },
      { status: 500 }
    );
  }

  // ══════════════════════════════════════════════════════════════
  // PHASE 3: Build folder hierarchy — create VirtualFolder entries
  // ══════════════════════════════════════════════════════════════

  // Map: Google Drive folder ID → VirtualFolder ID (in our DB)
  const gdriveIdToVFolderId = new Map<string, string>();

  // Check for existing VirtualFolders already linked to this account's Drive folders.
  // We use a naming convention: store the gdriveFolderId in a lookup.
  // Since VirtualFolder doesn't have a driveFolderId field, we match by
  // (userId, name, parentId) — but that's fragile. Instead, we'll use
  // the VirtualFolder.id itself and build a reverse lookup.
  //
  // Best approach: look up existing VirtualFolders for this user and
  // build a map keyed by name+parentId, then reuse when possible.
  // But to avoid duplicates on re-sync, we track by a composite key.

  // Actually, the cleanest way: store a mapping in the folder name or use
  // the Drive folder ID as a deterministic identifier. Since we can't add
  // a column, we'll use upsert on (userId, name) scoped to parent.
  // But that can collide. Better: we tag folders synced from Drive with
  // a special suffix or we just create them fresh each sync.
  //
  // PRACTICAL APPROACH: On each sync, we fetch ALL existing VirtualFolders
  // for the user and build a map. For Drive folders, we use a composite
  // key: `gdrive:${gdriveFolderId}` stored... hmm we don't have a field.
  //
  // SIMPLEST CORRECT APPROACH: Delete all previously-synced VirtualFolders
  // for this account's sync, then recreate. But that would lose user-created folders.
  //
  // FINAL APPROACH: We create VirtualFolders with the Drive folder name.
  // To avoid duplicates on re-sync, we check if a VirtualFolder with the same
  // name and parentId already exists for this user. If so, reuse it.
  // We store the mapping gdriveId → virtualFolderId in memory for this sync.

  // Build a set of existing (name, parentId) pairs for fast lookup.
  const existingFolders = await db.virtualFolder.findMany({
    where: { userId },
    select: { id: true, name: true, parentId: true },
  });

  // Key: `${name}::${parentId ?? 'root'}` → virtualFolderId
  const folderLookup = new Map<string, string>();
  for (const f of existingFolders) {
    const key = `${f.name}::${f.parentId ?? 'root'}`;
    folderLookup.set(key, f.id);
  }

  // Topological sort: parent folders before children.
  // Build adjacency: childFolderId → parentFolderId (from parents[0]).
  // Root folders have no parent in our map (or parent is not a folder we fetched).
  const folderParentMap = new Map<string, string | null>();
  for (const f of allFolders) {
    const parentGdriveId = f.parents?.[0] ?? null;
    // If the parent is also a folder we fetched, use it. Otherwise, treat as root.
    if (parentGdriveId && allFolders.some((pf) => pf.id === parentGdriveId)) {
      folderParentMap.set(f.id, parentGdriveId);
    } else {
      folderParentMap.set(f.id, null);
    }
  }

  // Topological sort using Kahn's algorithm.
  function topoSort(
    nodes: string[],
    parentMap: Map<string, string | null>
  ): string[] {
    const inDegree = new Map<string, number>();
    const children = new Map<string, string[]>();

    for (const id of nodes) {
      inDegree.set(id, 0);
      children.set(id, []);
    }

    for (const id of nodes) {
      const parentId = parentMap.get(id);
      if (parentId && nodes.includes(parentId)) {
        inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
        children.get(parentId)!.push(id);
      }
    }

    const queue: string[] = [];
    for (const id of nodes) {
      if ((inDegree.get(id) ?? 0) === 0) queue.push(id);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);
      for (const child of children.get(current) ?? []) {
        const deg = (inDegree.get(child) ?? 1) - 1;
        inDegree.set(child, deg);
        if (deg === 0) queue.push(child);
      }
    }

    // Any remaining nodes (cycles) — append them anyway.
    for (const id of nodes) {
      if (!sorted.includes(id)) sorted.push(id);
    }

    return sorted;
  }

  const sortedFolderIds = topoSort(
    allFolders.map((f) => f.id),
    folderParentMap
  );

  let foldersCreated = 0;
  let foldersReused = 0;

  // Create folders in topological order (parents first).
  for (const gdriveFolderId of sortedFolderIds) {
    const folder = allFolders.find((f) => f.id === gdriveFolderId);
    if (!folder) continue;

    // Determine the VirtualFolder parentId.
    const parentGdriveId = folderParentMap.get(gdriveFolderId) ?? null;
    const virtualParentId = parentGdriveId
      ? gdriveIdToVFolderId.get(parentGdriveId) ?? null
      : null;

    // Check if a VirtualFolder with this name + parentId already exists.
    const lookupKey = `${folder.name}::${virtualParentId ?? 'root'}`;
    const existingId = folderLookup.get(lookupKey);

    if (existingId) {
      gdriveIdToVFolderId.set(gdriveFolderId, existingId);
      foldersReused++;
    } else {
      // Create new VirtualFolder.
      try {
        const created = await db.virtualFolder.create({
          data: {
            userId,
            name: folder.name,
            parentId: virtualParentId,
          },
        });
        gdriveIdToVFolderId.set(gdriveFolderId, created.id);
        folderLookup.set(lookupKey, created.id);
        foldersCreated++;
      } catch {
        // If create fails (e.g. unique constraint race), try to find existing.
        const existing = await db.virtualFolder.findFirst({
          where: { userId, name: folder.name, parentId: virtualParentId },
        });
        if (existing) {
          gdriveIdToVFolderId.set(gdriveFolderId, existing.id);
          folderLookup.set(lookupKey, existing.id);
          foldersReused++;
        }
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // PHASE 4: Upsert files into VirtualFile (with folderId)
  // ══════════════════════════════════════════════════════════════

  // Filter: skip Google-native docs & invalid entries & folders themselves.
  const syncableFiles = allFiles.filter(
    (f): f is Required<DriveEntry> => {
      if (!f.id || !f.name) return false;
      if (f.mimeType === FOLDER_MIME) return false;
      if (GOOGLE_DOC_MIMETYPES.has(f.mimeType || '')) return false;
      return true;
    }
  );

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const file of syncableFiles) {
    try {
      const existing = await db.virtualFile.findFirst({
        where: { userId, physicalFileId: file.id, deletedAt: null },
      });

      // Determine folderId from the file's parents[0].
      const parentGdriveId = file.parents?.[0] ?? null;
      const virtualFolderId = parentGdriveId
        ? gdriveIdToVFolderId.get(parentGdriveId) ?? null
        : null;

      const fileData = {
        name: file.name,
        mimeType: file.mimeType || 'application/octet-stream',
        sizeBytes: BigInt(file.size || '0'),
        updatedAt: new Date(file.modifiedTime || Date.now()),
        folderId: virtualFolderId,
      };

      if (existing) {
        await db.virtualFile.update({ where: { id: existing.id }, data: fileData });
        updated++;
      } else {
        await db.virtualFile.create({
          data: {
            userId,
            driveAccountId: account.id,
            physicalFileId: file.id,
            ...fileData,
          },
        });
        created++;
      }
    } catch {
      failed++;
    }
  }

  await logActivity(userId, 'sync_drive', {
    fileName: account.displayName,
    details:
      `Drive: ${account.email} | ${foldersCreated} folder baru, ${foldersReused} folder existing | ${created} file baru, ${updated} update, ${failed} gagal dari ${syncableFiles.length} file`,
  });

  return NextResponse.json({
    ok: true,
    totalDriveFiles: allFiles.length,
    totalDriveFolders: allFolders.length,
    foldersCreated,
    foldersReused,
  syncableFiles: syncableFiles.length,
    created,
    updated,
    failed,
    message: `${foldersCreated} folder baru, ${created} file baru ditambahkan, ${updated} diperbarui.`,
  });
}

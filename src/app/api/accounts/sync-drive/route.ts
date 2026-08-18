// File: src/app/api/accounts/sync-drive/route.ts
// BARU — buat file ini di path tersebut

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

/**
 * POST /api/accounts/sync-drive
 * Body: { accountId: string }
 *
 * Lists ALL files from the connected Google Drive (paginated),
 * then upserts them into the VirtualFile table so they appear in the
 * AnsCloud file browser.
 *
 * - Skips Google-native docs (Sheets, Docs, Slides) because they
 *   cannot be downloaded as regular blobs via the Drive API.
 * - Uses upsert by (userId, physicalFileId) so re-sync is safe.
 * - Max 10 000 files per sync (Vercel serverless timeout guard).
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
    if (tokens.refresh_token) data.refreshToken = tokens.refreshToken;
    if (tokens.expiry_date) data.tokenExpiresAt = new Date(tokens.expiry_date);
    if (Object.keys(data).length > 0) {
      await db.driveAccount.update({ where: { id: account.id }, data });
    }
  });

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  // ── Paginate through ALL files ───────────────────────────────
  interface DriveFile {
    id?: string;
    name?: string;
    mimeType?: string;
    size?: string;
    modifiedTime?: string;
  }

  let allFiles: DriveFile[] = [];
  let pageToken: string | undefined = undefined;
  const MAX_FILES = 10_000;

  try {
    do {
      const res = await drive.files.list({
        q: 'trashed = false and \'me\' in owners',
        pageSize: 1000,
        pageToken,
        fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime)',
        orderBy: 'modifiedTime desc',
      });

      const files = res.data.files ?? [];
      allFiles.push(...files);
      pageToken = res.data.nextPageToken || undefined;

      if (allFiles.length >= MAX_FILES) break;
    } while (pageToken);
  } catch (err) {
    return NextResponse.json(
      { error: `Gagal mengambil daftar file: ${err instanceof Error ? err.message : 'Unknown'}` },
      { status: 500 }
    );
  }

  // ── Filter: skip Google-native docs & invalid entries ─────────
  const syncableFiles = allFiles.filter((f): f is Required<DriveFile> => {
    if (!f.id || !f.name) return false;
    if (GOOGLE_DOC_MIMETYPES.has(f.mimeType || '')) return false;
    return true;
  });

  // ── Upsert into VirtualFile ───────────────────────────────────
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const file of syncableFiles) {
    try {
      const existing = await db.virtualFile.findFirst({
        where: { userId, physicalFileId: file.id, deletedAt: null },
      });

      const fileData = {
        name: file.name,
        mimeType: file.mimeType || 'application/octet-stream',
        sizeBytes: BigInt(file.size || '0'),
        updatedAt: new Date(file.modifiedTime || Date.now()),
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
    details: `Drive: ${account.email} | ${created} baru, ${updated} update, ${failed} gagal dari ${syncableFiles.length} file`,
  });

  return NextResponse.json({
    ok: true,
 totalDriveFiles: allFiles.length,
  syncableFiles: syncableFiles.length,
  created,
    updated,
    failed,
    message: `${created} file baru ditambahkan, ${updated} diperbarui.`,
  });
}

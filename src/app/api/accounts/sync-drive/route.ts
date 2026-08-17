// File: src/app/api/accounts/sync-drive/route.ts
// UPDATE: Sekarang fetch folder juga, build drivePath untuk setiap file

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

export const dynamic = 'force-dynamic';

/**
 * POST /api/accounts/sync-drive
 * Body: { accountId: string }
 *
 * Lists ALL files & folders from the connected Google Drive (paginated),
 * builds folder paths, then upserts files into VirtualFile table.
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

  // ── Step 1: Fetch ALL folders (non-trashed) ──────────────────
  interface DriveFolder {
    id?: string;
    name?: string;
    parents?: string[];
  }
  
  let allFolders: DriveFolder[] = [];
  let folderPageToken: string | undefined = undefined;
  
  try {
    do {
      const res = await drive.files.list({
        q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        pageSize: 1000,
        pageToken: folderPageToken,
        fields: 'nextPageToken,files(id,name,parents)',
      });
      const folders = res.data.files ?? [];
      allFolders.push(...folders);
      folderPageToken = res.data.nextPageToken || undefined;
      if (allFolders.length >= 5000) break;
    } while (folderPageToken);
  } catch (err) {
    return NextResponse.json(
      { error: `Gagal mengambil daftar folder: ${err instanceof Error ? err.message : 'Unknown'}` },
      { status: 500 }
    );
  }

  // ── Step 2: Build folder maps ────────────────────────────────
  // folderId -> { name, parents }
  const folderMap = new Map<string, { name: string; parents: string[] }>();
  for (const f of allFolders) {
    if (f.id && f.name) {
      folderMap.set(f.id, { name: f.name, parents: (f.parents as string[]) ?? [] });
    }
  }

  // folderId -> full path (e.g. "Photos/Vacation/2024")
  const folderPathCache = new Map<string, string>();

  function getFolderPath(folderId: string): string {
    if (folderPathCache.has(folderId)) return folderPathCache.get(folderId)!;
    const folder = folderMap.get(folderId);
    if (!folder) return '';
    
    // Build path from parent chain
    const parts: string[] = [folder.name];
    let currentParents = folder.parents;
    const visited = new Set<string>();
    
    while (currentParents && currentParents.length > 0) {
      const parentId = currentParents[0];
      if (visited.has(parentId) || parentId === 'root') break;
      visited.add(parentId);
      
      const parent = folderMap.get(parentId);
      if (!parent) break;
      parts.unshift(parent.name);
      currentParents = parent.parents;
    }
    
    const path = parts.join('/');
    folderPathCache.set(folderId, path);
    return path;
  }

  // ── Step 3: Paginate through ALL files ───────────────────────
  interface DriveFile {
    id?: string;
    name?: string;
    mimeType?: string;
    size?: string;
    modifiedTime?: string;
    parents?: string[];
  }

  let allFiles: DriveFile[] = [];
  let pageToken: string | undefined = undefined;
  const MAX_FILES = 10_000;

  try {
    do {
      const res = await drive.files.list({
        q: 'trashed = false',
        pageSize: 1000,
        pageToken,
        fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,parents)',
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

  // ── Step 4: Filter & upsert ──────────────────────────────────
  const syncableFiles = allFiles.filter((f): f is Required<DriveFile> => {
    if (!f.id || !f.name) return false;
    if (GOOGLE_DOC_MIMETYPES.has(f.mimeType || '')) return false;
    return true;
  });

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const file of syncableFiles) {
    try {
      const existing = await db.virtualFile.findFirst({
        where: { userId, physicalFileId: file.id, deletedAt: null },
      });

      // Build drivePath from parent folder
      let drivePath: string | null = null;
      const parents = (file.parents as string[]) ?? [];
      if (parents.length > 0 && parents[0] !== 'root') {
        drivePath = getFolderPath(parents[0]);
      }

      const fileData = {
        name: file.name,
        mimeType: file.mimeType || 'application/octet-stream',
        sizeBytes: BigInt(file.size || '0'),
        updatedAt: new Date(file.modifiedTime || Date.now()),
        drivePath,
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

  // ── Step 5: Clean up files that were in Drive but now gone ──
  const syncedIds = new Set(syncableFiles.map(f => f.id));
  const staleFiles = await db.virtualFile.findMany({
    where: {
      userId,
      driveAccountId: account.id,
      deletedAt: null,
      physicalFileId: { notIn: Array.from(syncedIds) },
    },
    select: { id: true },
  });
  if (staleFiles.length > 0) {
    await db.virtualFile.updateMany({
      where: { id: { in: staleFiles.map(f => f.id) } },
      data: { deletedAt: new Date() },
    });
  }

  await logActivity(userId, 'sync_drive', {
    fileName: account.displayName,
    details: `Drive: ${account.email} | ${created} baru, ${updated} update, ${failed} gagal, ${staleFiles.length} dihapus dari ${syncableFiles.length} file`,
  });

  return NextResponse.json({
    ok: true,
    totalDriveFiles: allFiles.length,
    totalFolders: allFolders.length,
    syncableFiles: syncableFiles.length,
    created,
    updated,
    failed,
    removed: staleFiles.length,
    message: `${created} file baru ditambahkan, ${updated} diperbarui, ${staleFiles.length} file yang sudah tidak ada di Drive dipindah ke trash.`,
  });
}

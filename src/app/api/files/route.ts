import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { formatBytes, formatDate, deleteFile, getFileIcon } from '@/lib/storage';
import { logActivity } from '@/lib/activity';
import { requireUserId } from '@/lib/session';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/files?folderId=...&search=...&filter=...&sort=...&drivePath=...
 *
 * Filters:
 *   - filter=starred → only starred files (current user)
 *   - filter=trash   → only soft-deleted files
 *   - filter=recent  → most recent 50 files
 *   - drivePath=...  → only files with this drive path prefix
 *   - (default)      → active files in folderId
 *
 * Sort:
 *   - sort=name:asc|desc
 *   - sort=size:asc|desc
 *   - sort=modified:asc|desc
 *   - sort=type:asc|desc
 *   - sort=location:asc|desc (by drive account email)
 */
export async function GET(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const folderId = req.nextUrl.searchParams.get('folderId');
  const search = req.nextUrl.searchParams.get('search')?.trim();
  const filter = req.nextUrl.searchParams.get('filter');
  const sortParam = req.nextUrl.searchParams.get('sort') || 'name:asc';
  const drivePath = req.nextUrl.searchParams.get('drivePath');

  // Parse sort parameter
  const [sortField, sortDir] = sortParam.split(':');
  const orderBy = buildOrderBy(sortField, sortDir === 'desc' ? 'desc' : 'asc');

  // RECENT
  if (filter === 'recent') {
    const files = await db.virtualFile.findMany({
      where: { userId, deletedAt: null },
      orderBy,
      take: 50,
      include: { driveAccount: true, folder: true },
    });
    return NextResponse.json({ files: files.map((f) => mapFile(f)), folders: [], driveFolders: [] });
  }

  // STARRED
  if (filter === 'starred') {
    const files = await db.virtualFile.findMany({
      where: { userId, isStarred: true, deletedAt: null },
      orderBy,
      include: { driveAccount: true, folder: true },
    });
    return NextResponse.json({ files: files.map((f) => mapFile(f)), folders: [], driveFolders: [] });
  }

  // TRASH
  if (filter === 'trash') {
    const files = await db.virtualFile.findMany({
      where: { userId, deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
      include: { driveAccount: true, folder: true },
    });
    return NextResponse.json({
      files: files.map((f) => ({ ...mapFile(f), deletedAt: f.deletedAt?.toISOString() })),
      folders: [],
      driveFolders: [],
    });
  }

  // SEARCH
  if (search) {
    const files = await db.virtualFile.findMany({
      where: { userId, name: { contains: search }, deletedAt: null },
      orderBy,
      include: { driveAccount: true, folder: true },
    });
    return NextResponse.json({ files: files.map((f) => mapFile(f)), folders: [], driveFolders: [] });
  }

  // DRIVE PATH FILTER — show files inside a specific Drive folder path
  if (drivePath) {
    const files = await db.virtualFile.findMany({
      where: {
        userId,
        deletedAt: null,
        drivePath,
      },
      orderBy,
      include: { driveAccount: true },
    });

    // Get sub-folders (paths that start with current path + "/")
    const allFilesWithPath = await db.virtualFile.findMany({
      where: {
        userId,
        deletedAt: null,
        drivePath: { not: null, startsWith: drivePath + '/' },
      },
      select: { drivePath: true },
      distinct: ['drivePath'],
    });

    // Extract unique immediate sub-folder names
    const subFolders = new Map<string, string>(); // name -> full path
    for (const f of allFilesWithPath) {
      if (!f.drivePath) continue;
      const relative = f.drivePath.slice(drivePath.length + 1);
      const firstSegment = relative.split('/')[0];
      if (firstSegment && !subFolders.has(firstSegment)) {
        subFolders.set(firstSegment, drivePath + '/' + firstSegment);
      }
    }

    return NextResponse.json({
      folders: Array.from(subFolders.entries()).map(([name, path]) => ({
        id: `drive:${path}`,
        name,
        icon: 'folder',
        createdAt: new Date().toISOString(),
        createdAtFormatted: '',
        type: 'folder' as const,
        drivePath: path,
      })),
      files: files.map((f) => mapFile(f)),
      driveFolders: [],
    });
  }

  // DEFAULT — active files & subfolders in folderId (or root)
  const effectiveFolderId =
    folderId && folderId !== 'null' && folderId !== 'undefined' ? folderId : null;

  const [files, folders] = await Promise.all([
    db.virtualFile.findMany({
      where: { userId, folderId: effectiveFolderId, deletedAt: null },
      orderBy,
      include: { driveAccount: true },
    }),
    db.virtualFolder.findMany({
      where: { userId, parentId: effectiveFolderId },
      orderBy: { name: 'asc' },
    }),
  ]);

  // Also get unique drive folder paths for files at root (no folderId)
  const driveFolders = await getDriveFolders(userId, effectiveFolderId);

  return NextResponse.json({
    folders: folders.map((f) => ({
      id: f.id,
      name: f.name,
      icon: f.icon,
      createdAt: f.createdAt.toISOString(),
      createdAtFormatted: formatDate(f.createdAt),
      type: 'folder' as const,
    })),
    files: files.map((f) => mapFile(f)),
    driveFolders,
  });
}

/** Get unique top-level Drive folder paths for files at the given folderId */
async function getDriveFolders(userId: string, folderId: string | null) {
  // Only show Drive folders for root level (no AnsCloud folder selected)
  if (folderId) return [];

  const filesWithPaths = await db.virtualFile.findMany({
    where: {
      userId,
      deletedAt: null,
      folderId: null,
      drivePath: { not: null, not: '' },
    },
    select: { drivePath: true },
    distinct: ['drivePath'],
  });

  // Group by first segment
  const topLevel = new Map<string, number>(); // name -> count
  for (const f of filesWithPaths) {
    if (!f.drivePath) continue;
    const firstSegment = f.drivePath.split('/')[0];
    if (firstSegment) {
      topLevel.set(firstSegment, (topLevel.get(firstSegment) ?? 0) + 1);
    }
  }

  // Also count files with no drivePath (root files)
  const rootCount = await db.virtualFile.count({
    where: {
      userId,
      deletedAt: null,
      folderId: null,
      OR: [
        { drivePath: null },
        { drivePath: '' },
      ],
    },
  });

  return Array.from(topLevel.entries()).map(([name, count]) => ({
    name,
    path: name,
    count,
  }));
}

function buildOrderBy(field: string, dir: 'asc' | 'desc'): Prisma.VirtualFileOrderByWithRelationInput {
  switch (field) {
    case 'size':
      return { sizeBytes: dir };
    case 'modified':
      return { updatedAt: dir };
    case 'type':
      return { mimeType: dir };
    case 'location':
      return { driveAccount: { email: dir } };
    case 'name':
    default:
      return { name: dir };
  }
}

function mapFile(f: {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: bigint;
  isStarred: boolean;
  createdAt: Date;
  updatedAt: Date;
  driveAccountId: string;
  driveAccount: { email: string; avatarColor: string };
  folder?: { name: string } | null;
  drivePath?: string | null;
}) {
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    sizeBytes: f.sizeBytes.toString(),
    sizeFormatted: formatBytes(f.sizeBytes),
    isStarred: f.isStarred,
    createdAt: f.createdAt.toISOString(),
    createdAtFormatted: formatDate(f.createdAt),
    updatedAt: f.updatedAt.toISOString(),
    driveAccountId: f.driveAccountId,
    driveAccountEmail: f.driveAccount.email,
    driveAccountColor: f.driveAccount.avatarColor,
    folderName: f.folder?.name ?? null,
    drivePath: f.drivePath ?? null,
    icon: getFileIcon(f.mimeType),
    type: 'file' as const,
  };
}

/**
 * PATCH /api/files — rename, move, or toggle star.
 * Body: { id, name?, folderId?, isStarred? }
 */
export async function PATCH(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? '');
  if (!id) return NextResponse.json({ error: 'ID wajib diisi.' }, { status: 400 });

  const existing = await db.virtualFile.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: 'File tidak ditemukan.' }, { status: 404 });

  const data: { name?: string; folderId?: string | null; isStarred?: boolean } = {};
  if (typeof body.name === 'string' && body.name.trim()) {
    data.name = body.name.trim();
  }
  if ('folderId' in body) {
    data.folderId = body.folderId ?? null;
  }
  if (typeof body.isStarred === 'boolean') {
    data.isStarred = body.isStarred;
  }

  const updated = await db.virtualFile.update({ where: { id }, data });

  if (typeof body.isStarred === 'boolean') {
    await logActivity(userId, body.isStarred ? 'star' : 'unstar', {
      fileName: existing.name,
      details: `File ID: ${id}`,
    });
  }
  if (data.name && data.name !== existing.name) {
    await logActivity(userId, 'rename', {
      fileName: data.name,
      details: `Renamed from "${existing.name}"`,
    });
  }

  return NextResponse.json({
    file: { id: updated.id, name: updated.name, folderId: updated.folderId, isStarred: updated.isStarred },
  });
}

/**
 * DELETE /api/files?id=...&permanent=false
 *
 * Default: soft-delete (move to trash, restorable)
 * permanent=true: hard-delete (remove physical blob + DB row)
 */
export async function DELETE(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get('id');
  const permanent = req.nextUrl.searchParams.get('permanent') === 'true';
  if (!id) return NextResponse.json({ error: 'ID wajib diisi.' }, { status: 400 });

  const file = await db.virtualFile.findFirst({
    where: { id, userId },
    include: { driveAccount: true },
  });
  if (!file) return NextResponse.json({ error: 'File tidak ditemukan.' }, { status: 404 });

  if (permanent) {
    await deleteFile(file.driveAccount, file.physicalFileId);
    await db.virtualFile.delete({ where: { id } });
    // Also delete any shared links to this file.
    await db.sharedLink.deleteMany({ where: { fileId: id } });
    await logActivity(userId, 'permanent_delete', {
      fileName: file.name,
      sizeBytes: file.sizeBytes,
    });
    return NextResponse.json({ ok: true, permanent: true });
  }

  await db.virtualFile.update({ where: { id }, data: { deletedAt: new Date() } });
  await logActivity(userId, 'delete', { fileName: file.name, sizeBytes: file.sizeBytes });
  return NextResponse.json({ ok: true, trashed: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { formatBytes, formatDate, deleteFile, getFileIcon } from '@/lib/storage';
import { logActivity } from '@/lib/activity';
import { requireUserId } from '@/lib/session';

/**
 * GET /api/files?folderId=...&search=...&filter=...&sort=...
 *
 * Filters:
 *   - filter=starred → only starred files (current user)
 *   - filter=trash   → only soft-deleted files
 *   - filter=recent  → most recent 50 files
 *   - (default)      → active files in folderId
 *
 * Sort: &sort=field:direction
 *   field: name | size | modified | type | location
 *   direction: asc | desc
 *   Example: &sort=name:asc, &sort=size:desc
 *   Default: name:asc
 */
function buildOrderBy(sortParam: string | null): Prisma.VirtualFileOrderByWithRelationInput {
  if (!sortParam) return { name: 'asc' };
  const [field, dir] = sortParam.split(':');
  const direction: Prisma.SortOrder = dir === 'desc' ? 'desc' : 'asc';
  switch (field) {
    case 'name': return { name: direction };
    case 'size': return { sizeBytes: direction };
    case 'modified': return { updatedAt: direction };
    case 'type': return { mimeType: direction };
    case 'location': return { driveAccount: { email: direction } };
    default: return { name: 'asc' };
  }
}

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
  const sortParam = req.nextUrl.searchParams.get('sort');
  const orderBy = buildOrderBy(sortParam);

  // RECENT
  if (filter === 'recent') {
    const files = await db.virtualFile.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { driveAccount: true, folder: true },
    });
    return NextResponse.json({ files: files.map((f) => mapFile(f)), folders: [] });
  }

  // STARRED
  if (filter === 'starred') {
    const files = await db.virtualFile.findMany({
      where: { userId, isStarred: true, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      include: { driveAccount: true, folder: true },
    });
    return NextResponse.json({ files: files.map((f) => mapFile(f)), folders: [] });
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
    });
  }

  // SEARCH
  if (search) {
    const files = await db.virtualFile.findMany({
      where: { userId, name: { contains: search }, deletedAt: null },
      orderBy,
      include: { driveAccount: true, folder: true },
    });
    return NextResponse.json({ files: files.map((f) => mapFile(f)), folders: [] });
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
  });
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

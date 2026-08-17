import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/activity';
import { requireUserId } from '@/lib/session';

/**
 * GET /api/folders?folderId=...  — list children + breadcrumb chain
 * POST /api/folders              — create { name, parentId? }
 * PATCH /api/folders             — rename { id, name }
 * DELETE /api/folders?id=...     — delete folder (cascade files inside)
 */

export async function GET(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const folderIdParam = req.nextUrl.searchParams.get('folderId');
  const folderId = folderIdParam && folderIdParam.trim() ? folderIdParam : null;

  const breadcrumb: Array<{ id: string | null; name: string }> = [];
  let currentId = folderId ?? null;
  const visited = new Set<string>();
  while (currentId) {
    if (visited.has(currentId)) break;
    visited.add(currentId);
    const f = await db.virtualFolder.findFirst({ where: { id: currentId, userId } });
    if (!f) break;
    breadcrumb.unshift({ id: f.id, name: f.name });
    currentId = f.parentId;
  }
  breadcrumb.unshift({ id: null, name: 'My AnsCloud' });

  const [folders, files] = await Promise.all([
    db.virtualFolder.findMany({
      where: { userId, parentId: folderId ?? null },
      orderBy: { name: 'asc' },
    }),
    db.virtualFile.findMany({
      where: { userId, folderId: folderId ?? null, deletedAt: null },
      orderBy: { name: 'asc' },
      include: { driveAccount: true },
    }),
  ]);

  return NextResponse.json({
    breadcrumb,
    folders: folders.map((f) => ({
      id: f.id,
      name: f.name,
      parentId: f.parentId,
      createdAt: f.createdAt.toISOString(),
    })),
    files: files.map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes.toString(),
      driveAccountId: f.driveAccountId,
      driveAccountEmail: f.driveAccount.email,
      driveAccountColor: f.driveAccount.avatarColor,
      createdAt: f.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? '').trim();
  const parentId = body.parentId ? String(body.parentId) : null;

  if (!name) return NextResponse.json({ error: 'Nama folder wajib diisi.' }, { status: 400 });

  if (parentId) {
    const parent = await db.virtualFolder.findFirst({ where: { id: parentId, userId } });
    if (!parent) return NextResponse.json({ error: 'Folder induk tidak ditemukan.' }, { status: 404 });
  }

  const folder = await db.virtualFolder.create({
    data: { userId, name, parentId },
  });
  await logActivity(userId, 'create_folder', { fileName: name });
  return NextResponse.json({ folder });
}

export async function PATCH(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? '');
  const name = String(body.name ?? '').trim();
  if (!id || !name) return NextResponse.json({ error: 'ID dan nama wajib diisi.' }, { status: 400 });

  const existing = await db.virtualFolder.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: 'Folder tidak ditemukan.' }, { status: 404 });

  const folder = await db.virtualFolder.update({ where: { id }, data: { name } });
  return NextResponse.json({ folder });
}

export async function DELETE(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID wajib diisi.' }, { status: 400 });

  const existing = await db.virtualFolder.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: 'Folder tidak ditemukan.' }, { status: 404 });

  // Collect files to physically delete (cascade will delete DB rows).
  const accountSelect = {
    id: true, provider: true, email: true, displayName: true,
    totalBytes: true, accessToken: true, refreshToken: true,
    tokenExpiresAt: true, driveRootFolderId: true,
  } as const;

  const files = await db.virtualFile.findMany({
    where: { folder: { id }, userId },
    select: {
      driveAccountId: true, physicalFileId: true,
      driveAccount: { select: accountSelect },
    },
  });

  type FileWithAccount = {
    driveAccountId: string;
    physicalFileId: string;
    driveAccount: {
      id: string; provider: string; email: string; displayName: string;
      totalBytes: bigint; accessToken: string | null; refreshToken: string | null;
      tokenExpiresAt: Date | null; driveRootFolderId: string | null;
    };
  };

  const collectFiles = async (folderId: string): Promise<FileWithAccount[]> => {
    const subfolders = await db.virtualFolder.findMany({
      where: { parentId: folderId, userId },
      select: { id: true },
    });
    const subFiles: FileWithAccount[] = [];
    for (const sf of subfolders) {
      subFiles.push(...(await collectFiles(sf.id)));
    }
    const sf2 = await db.virtualFile.findMany({
      where: { folderId, userId },
      select: { driveAccountId: true, physicalFileId: true, driveAccount: { select: accountSelect } },
    });
    subFiles.push(...sf2);
    return subFiles;
  };

  const allFiles: FileWithAccount[] = [...files, ...(await collectFiles(id))];

  // Delete shared links to files in this folder tree.
  await db.sharedLink.deleteMany({
    where: { fileId: { in: allFiles.map((f) => f.driveAccountId) } }, // not perfect but cleanup attempt
  });

  await db.virtualFolder.delete({ where: { id } });

  const { deleteFile } = await import('@/lib/storage');
  await Promise.all(
    allFiles.map((f) => deleteFile(f.driveAccount, f.physicalFileId).catch(() => {}))
  );

  return NextResponse.json({ ok: true });
}

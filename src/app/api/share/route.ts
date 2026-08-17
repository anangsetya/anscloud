import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/activity';
import { requireUserId } from '@/lib/session';

/**
 * GET /api/share?fileId=...    — list all shared links for a file (current user)
 * POST /api/share              — create a new shared link
 *   Body: { fileId, password?, expiresAt? (ISO string), downloadLimit? }
 * DELETE /api/share?id=...     — revoke a shared link
 */

export async function GET(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const fileId = req.nextUrl.searchParams.get('fileId');
  if (fileId) {
    const links = await db.sharedLink.findMany({
      where: { fileId, userId },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({
      links: links.map((l) => ({
        id: l.id,
        token: l.token,
        fileId: l.fileId,
        hasPassword: !!l.passwordHash,
        expiresAt: l.expiresAt?.toISOString() ?? null,
        downloadLimit: l.downloadLimit,
        downloadCount: l.downloadCount,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  }

  // All shared links for current user
  const links = await db.sharedLink.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { file: { select: { name: true, mimeType: true, sizeBytes: true } } },
  });
  return NextResponse.json({
    links: links.map((l) => ({
      id: l.id,
      token: l.token,
      fileId: l.fileId,
      fileName: l.file?.name ?? null,
      hasPassword: !!l.passwordHash,
      expiresAt: l.expiresAt?.toISOString() ?? null,
      downloadLimit: l.downloadLimit,
      downloadCount: l.downloadCount,
      createdAt: l.createdAt.toISOString(),
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
  const fileId = String(body.fileId ?? '');
  const password = body.password ? String(body.password) : null;
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  const downloadLimit = body.downloadLimit ? Number(body.downloadLimit) : null;

  if (!fileId) return NextResponse.json({ error: 'fileId wajib diisi.' }, { status: 400 });

  const file = await db.virtualFile.findFirst({ where: { id: fileId, userId } });
  if (!file) return NextResponse.json({ error: 'File tidak ditemukan.' }, { status: 404 });

  if (expiresAt && isNaN(expiresAt.getTime())) {
    return NextResponse.json({ error: 'expiresAt tidak valid.' }, { status: 400 });
  }

  let passwordHash: string | null = null;
  if (password) {
    const bcrypt = await import('bcryptjs');
    passwordHash = bcrypt.hashSync(password, 12);
  }

  const link = await db.sharedLink.create({
    data: {
      userId,
      fileId,
      passwordHash,
      expiresAt,
      downloadLimit,
    },
  });

  await logActivity(userId, 'share', {
    fileName: file.name,
    details: `Token: ${link.token.substring(0, 8)}...`,
  });

  return NextResponse.json({
    link: {
      id: link.id,
      token: link.token,
      fileId: link.fileId,
      hasPassword: !!link.passwordHash,
      expiresAt: link.expiresAt?.toISOString() ?? null,
      downloadLimit: link.downloadLimit,
      createdAt: link.createdAt.toISOString(),
    },
  });
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

  const link = await db.sharedLink.findFirst({ where: { id, userId } });
  if (!link) return NextResponse.json({ error: 'Share link tidak ditemukan.' }, { status: 404 });

  await db.sharedLink.delete({ where: { id } });
  await logActivity(userId, 'unshare', { details: `Token: ${link.token.substring(0, 8)}...` });

  return NextResponse.json({ ok: true });
}

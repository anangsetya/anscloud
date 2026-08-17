import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/activity';
import { requireUserId } from '@/lib/session';

/**
 * POST /api/files/restore
 * Body: { id: string }
 * Restores a soft-deleted file from trash (sets deletedAt back to null).
 */
export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? '');
  if (!id) return NextResponse.json({ error: 'ID wajib diisi.' }, { status: 400 });

  const file = await db.virtualFile.findFirst({ where: { id, userId } });
  if (!file) return NextResponse.json({ error: 'File tidak ditemukan.' }, { status: 404 });
  if (!file.deletedAt) {
    return NextResponse.json({ error: 'File tidak ada di trash.' }, { status: 400 });
  }

  await db.virtualFile.update({ where: { id }, data: { deletedAt: null } });
  await logActivity(userId, 'restore', { fileName: file.name });

  return NextResponse.json({ ok: true });
}

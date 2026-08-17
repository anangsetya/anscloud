import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { deleteFile } from '@/lib/storage';
import { logActivity } from '@/lib/activity';
import { requireUserId } from '@/lib/session';

/**
 * POST /api/files/bulk
 * Body: { ids: string[], action: 'delete'|'permanent_delete'|'restore'|'star'|'unstar' }
 */
export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  const action = String(body.action ?? '');

  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids tidak boleh kosong.' }, { status: 400 });
  }
  const validActions = ['delete', 'permanent_delete', 'restore', 'star', 'unstar'];
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: `action tidak valid: ${action}` }, { status: 400 });
  }

  const files = await db.virtualFile.findMany({
    where: { id: { in: ids }, userId },
    include: { driveAccount: true },
  });

  let processed = 0;
  let failed = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const file of files) {
    try {
      switch (action) {
        case 'delete':
          await db.virtualFile.update({ where: { id: file.id }, data: { deletedAt: new Date() } });
          break;
        case 'permanent_delete':
          await deleteFile(file.driveAccount, file.physicalFileId);
          await db.sharedLink.deleteMany({ where: { fileId: file.id } });
          await db.virtualFile.delete({ where: { id: file.id } });
          break;
        case 'restore':
          await db.virtualFile.update({ where: { id: file.id }, data: { deletedAt: null } });
          break;
        case 'star':
          await db.virtualFile.update({ where: { id: file.id }, data: { isStarred: true } });
          break;
        case 'unstar':
          await db.virtualFile.update({ where: { id: file.id }, data: { isStarred: false } });
          break;
      }
      processed++;
    } catch (err) {
      failed++;
      errors.push({ id: file.id, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  await logActivity(userId, action === 'permanent_delete' ? 'permanent_delete' : action, {
    details: `Bulk: ${processed} files`,
  });

  return NextResponse.json({
    ok: true,
    action,
    processed,
    failed,
    errors: errors.slice(0, 20),
  });
}

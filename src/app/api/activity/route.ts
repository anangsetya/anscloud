import { NextResponse } from 'next/server';
import { getRecentActivity } from '@/lib/activity';
import { formatDate } from '@/lib/storage';
import { requireUserId } from '@/lib/session';

/**
 * GET /api/activity
 * Returns recent activity log entries for the current user (max 50).
 */
export async function GET() {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const logs = await getRecentActivity(userId, 50);
  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      action: l.action,
      fileName: l.fileName,
      sizeBytes: l.sizeBytes?.toString() ?? null,
      details: l.details,
      createdAt: l.createdAt.toISOString(),
      createdAtFormatted: formatDate(l.createdAt),
    })),
  });
}

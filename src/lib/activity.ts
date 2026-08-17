import { db } from './db';

/**
 * Activity log helper — records file operations for audit trail.
 * Each entry is scoped to a specific user.
 */

export type ActivityAction =
  | 'upload'
  | 'download'
  | 'delete'
  | 'restore'
  | 'permanent_delete'
  | 'star'
  | 'unstar'
  | 'rename'
  | 'create_folder'
  | 'migrate'
  | 'connect_account'
  | 'disconnect_account'
  | 'share'
  | 'unshare';

export async function logActivity(
  userId: string,
  action: ActivityAction,
  options: { fileName?: string; sizeBytes?: bigint; details?: string } = {}
): Promise<void> {
  try {
    await db.activityLog.create({
      data: {
        userId,
        action,
        fileName: options.fileName ?? null,
        sizeBytes: options.sizeBytes ?? null,
        details: options.details ?? null,
      },
    });
  } catch (err) {
    console.warn('[activity] Failed to log:', action, err);
  }
}

export async function getRecentActivity(userId: string, limit: number = 20) {
  return db.activityLog.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { db } from './db';

/**
 * Server-side helper — get the authenticated user's ID from the session.
 * Returns null if not logged in.
 *
 * Used by API routes to scope all queries to the current user.
 *
 * Usage:
 *   const userId = await getUserId();
 *   if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 *   const accounts = await db.driveAccount.findMany({ where: { userId } });
 */
export async function getUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}

/**
 * Throws if user is not authenticated. Use in API routes that need to
 * hard-fail on unauthenticated access (most do).
 */
export async function requireUserId(): Promise<string> {
  const userId = await getUserId();
  if (!userId) {
    throw new Error('UNAUTHORIZED');
  }
  return userId;
}

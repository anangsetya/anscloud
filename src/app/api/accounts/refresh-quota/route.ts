import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { refreshAccountQuota, formatBytes } from '@/lib/storage';
import { requireUserId } from '@/lib/session';

/**
 * POST /api/accounts/refresh-quota?id=...
 * For provider='google' accounts: fetches live Drive quota from Drive API.
 * For provider='local' accounts: no-op (returns current DB values).
 */
export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID wajib diisi.' }, { status: 400 });

  const account = await db.driveAccount.findFirst({ where: { id, userId } });
  if (!account) return NextResponse.json({ error: 'Akun tidak ditemukan.' }, { status: 404 });

  try {
    const quota = await refreshAccountQuota(id);
    return NextResponse.json({
      ok: true,
      totalBytes: quota.totalBytes.toString(),
      usedBytes: quota.usedBytes.toString(),
      totalBytesFormatted: formatBytes(quota.totalBytes),
      usedBytesFormatted: formatBytes(quota.usedBytes),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Gagal memeriksa kuota.' },
      { status: 500 }
    );
  }
}

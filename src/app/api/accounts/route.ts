import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAccountUsage, formatBytes, cleanupAccountStorage } from '@/lib/storage';
import { requireUserId } from '@/lib/session';
import { logActivity } from '@/lib/activity';

/**
 * GET /api/accounts — list all connected Google Drive accounts for the current user.
 */
export async function GET() {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accounts = await db.driveAccount.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { files: true } } },
  });

  const result = await Promise.all(
    accounts.map(async (a) => {
      const usage = await getAccountUsage(a.id);
      return {
        id: a.id,
        email: a.email,
        displayName: a.displayName,
        avatarColor: a.avatarColor,
        provider: a.provider,
        totalBytes: a.totalBytes.toString(),
        usedBytes: usage.usedBytes.toString(),
        freeBytes: usage.freeBytes.toString(),
        usedPct: usage.usedPct,
        totalBytesFormatted: formatBytes(a.totalBytes),
        usedBytesFormatted: formatBytes(usage.usedBytes),
        freeBytesFormatted: formatBytes(usage.freeBytes),
        fileCount: a._count.files,
        createdAt: a.createdAt.toISOString(),
      };
    })
  );

  return NextResponse.json({ accounts: result });
}

/**
 * POST /api/accounts — add a new DEMO account (provider='local').
 * For REAL Google Drive accounts, user is redirected to /api/auth/google/login.
 *
 * Body: { email, displayName, totalBytesGB?, avatarColor? }
 */
export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? '').trim().toLowerCase();
  const displayName = String(body.displayName ?? '').trim();
  const totalBytesGB = Number(body.totalBytesGB ?? 15);
  const avatarColor = String(body.avatarColor ?? '#0A84FF');

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Email tidak valid.' }, { status: 400 });
  }
  if (!displayName) {
    return NextResponse.json({ error: 'Nama tampilan wajib diisi.' }, { status: 400 });
  }
  if (!Number.isFinite(totalBytesGB) || totalBytesGB <= 0 || totalBytesGB > 30000) {
    return NextResponse.json({ error: 'Kuota harus antara 0.1 dan 30000 GB.' }, { status: 400 });
  }

  const existing = await db.driveAccount.findUnique({
    where: { userId_email: { userId, email } },
  });
  if (existing) {
    return NextResponse.json({ error: 'Email akun sudah terdaftar untuk user ini.' }, { status: 409 });
  }

  const totalBytes = BigInt(Math.round(totalBytesGB * 1024 * 1024 * 1024));
  const account = await db.driveAccount.create({
    data: {
      userId,
      email,
      displayName,
      avatarColor,
      provider: 'local',
      totalBytes,
    },
  });

  await logActivity(userId, 'connect_account', {
    fileName: displayName,
    details: `Email: ${email}`,
  });

  return NextResponse.json({
    account: {
      id: account.id,
      email: account.email,
      displayName: account.displayName,
      avatarColor: account.avatarColor,
      provider: account.provider,
      totalBytes: account.totalBytes.toString(),
    },
  });
}

/**
 * DELETE /api/accounts?id=...
 * - provider='local': all demo files in /storage/{id}/ are deleted too.
 * - provider='google': user's actual files in their real Google Drive are LEFT IN PLACE.
 *   Only AnsCloud metadata (VirtualFile rows) is removed.
 */
export async function DELETE(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID akun wajib diisi.' }, { status: 400 });

  const existing = await db.driveAccount.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: 'Akun tidak ditemukan.' }, { status: 404 });

  await db.driveAccount.delete({ where: { id } });
  await cleanupAccountStorage(id);

  await logActivity(userId, 'disconnect_account', {
    fileName: existing.displayName,
    details: `Email: ${existing.email}`,
  });

  return NextResponse.json({ ok: true });
}

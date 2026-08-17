import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAccountUsage, getAggregateUsage, formatBytes } from '@/lib/storage';
import { categorizeFile } from '@/lib/categorize';
import { requireUserId } from '@/lib/session';

/**
 * GET /api/storage-summary
 * Returns the aggregate storage overview across all connected accounts for
 * the current user, plus per-account breakdown AND breakdown by file type.
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

  const aggregate = await getAggregateUsage(userId);

  const perAccount = await Promise.all(
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
      };
    })
  );

  // Build breakdown by file type (using categorizeFile helper).
  const allFiles = await db.virtualFile.findMany({
    where: { userId, deletedAt: null },
    select: { name: true, mimeType: true, sizeBytes: true },
  });
  const typeBreakdown: Record<string, { count: number; totalBytes: bigint; color: string }> = {};
  for (const f of allFiles) {
    const cat = categorizeFile(f.mimeType, f.name);
    if (!typeBreakdown[cat.folderName]) {
      typeBreakdown[cat.folderName] = {
        count: 0,
        totalBytes: 0n,
        color: TYPE_COLORS[cat.folderName] ?? '#6b7280',
      };
    }
    typeBreakdown[cat.folderName].count++;
    typeBreakdown[cat.folderName].totalBytes += f.sizeBytes;
  }

  return NextResponse.json({
    aggregate: {
      totalBytes: aggregate.totalBytes.toString(),
      usedBytes: aggregate.usedBytes.toString(),
      freeBytes: aggregate.freeBytes.toString(),
      usedPct: aggregate.usedPct,
      accountCount: aggregate.accountCount,
      totalBytesFormatted: formatBytes(aggregate.totalBytes),
      usedBytesFormatted: formatBytes(aggregate.usedBytes),
      freeBytesFormatted: formatBytes(aggregate.freeBytes),
    },
    accounts: perAccount,
    typeBreakdown: Object.entries(typeBreakdown)
      .map(([name, info]) => ({
        name,
        count: info.count,
        totalBytes: info.totalBytes.toString(),
        totalBytesFormatted: formatBytes(info.totalBytes),
        color: info.color,
      }))
      .sort((a, b) => (BigInt(b.totalBytes) > BigInt(a.totalBytes) ? 1 : -1)),
  });
}

const TYPE_COLORS: Record<string, string> = {
  PDF: '#dc2626',
  Word: '#2563eb',
  Excel: '#16a34a',
  Powerpoint: '#ea580c',
  Images: '#a855f7',
  Video: '#ef4444',
  Audio: '#f59e0b',
  Archive: '#f97316',
  Code: '#0891b2',
  Text: '#64748b',
  Others: '#6b7280',
};

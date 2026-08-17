import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { formatBytes, formatDate } from '@/lib/storage';
import { requireUserId } from '@/lib/session';

/**
 * GET /api/files/[id]/versions
 * List version history for a file. Returns the current version + all archived versions.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;

  const file = await db.virtualFile.findFirst({
    where: { id, userId },
    select: {
      id: true,
      name: true,
      mimeType: true,
      sizeBytes: true,
      currentVersion: true,
      driveAccountId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!file) return NextResponse.json({ error: 'File tidak ditemukan.' }, { status: 404 });

  const oldVersions = await db.fileVersion.findMany({
    where: { fileId: id },
    orderBy: { versionNumber: 'desc' },
  });

  const allVersions = [
    {
      versionNumber: file.currentVersion,
      sizeBytes: file.sizeBytes.toString(),
      sizeFormatted: formatBytes(file.sizeBytes),
      mimeType: file.mimeType,
      createdAt: file.updatedAt.toISOString(),
      createdAtFormatted: formatDate(file.updatedAt),
      isCurrent: true,
    },
    ...oldVersions.map((v) => ({
      versionNumber: v.versionNumber,
      sizeBytes: v.sizeBytes.toString(),
      sizeFormatted: formatBytes(v.sizeBytes),
      mimeType: v.mimeType,
      createdAt: v.createdAt.toISOString(),
      createdAtFormatted: formatDate(v.createdAt),
      isCurrent: false,
    })),
  ];

  return NextResponse.json({
    file: {
      id: file.id,
      name: file.name,
      currentVersion: file.currentVersion,
    },
    versions: allVersions,
  });
}

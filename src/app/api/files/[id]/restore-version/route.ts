import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/activity';
import { requireUserId } from '@/lib/session';

/**
 * POST /api/files/[id]/restore-version
 * Body: { versionNumber: number }
 *
 * Restore a file to a previous version:
 *   1. Save the CURRENT version as a new FileVersion (so it's not lost)
 *   2. Find the requested version in FileVersion table
 *   3. Move the old version's physicalFileId + sizeBytes + mimeType to VirtualFile
 *   4. Increment currentVersion (so the restored version becomes the latest)
 */
export async function POST(
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
  const body = await req.json().catch(() => ({}));
  const versionNumber = Number(body.versionNumber);

  if (!Number.isFinite(versionNumber) || versionNumber < 1) {
    return NextResponse.json({ error: 'versionNumber tidak valid.' }, { status: 400 });
  }

  const file = await db.virtualFile.findFirst({
    where: { id, userId },
    include: { driveAccount: true },
  });
  if (!file) return NextResponse.json({ error: 'File tidak ditemukan.' }, { status: 404 });

  // Cannot restore the current version — it's already active.
  if (versionNumber === file.currentVersion) {
    return NextResponse.json({ error: 'Versi tersebut sudah menjadi versi aktif.' }, { status: 400 });
  }

  // Find the old version to restore.
  const oldVersion = await db.fileVersion.findUnique({
    where: { fileId_versionNumber: { fileId: id, versionNumber } },
  });
  if (!oldVersion) {
    return NextResponse.json({ error: `Versi ${versionNumber} tidak ditemukan.` }, { status: 404 });
  }

  // Save current version to FileVersion (so it's preserved in history).
  await db.fileVersion.create({
    data: {
      fileId: file.id,
      versionNumber: file.currentVersion,
      physicalFileId: file.physicalFileId,
      driveAccountId: file.driveAccountId,
      sizeBytes: file.sizeBytes,
      mimeType: file.mimeType,
    },
  });

  // Delete the old version entry we're restoring from (we have its data,
  // and keeping it around would create a duplicate when restored).
  await db.fileVersion.delete({ where: { id: oldVersion.id } });

  // Update VirtualFile to point to the restored version's blob.
  const updated = await db.virtualFile.update({
    where: { id },
    data: {
      physicalFileId: oldVersion.physicalFileId,
      driveAccountId: oldVersion.driveAccountId,
      sizeBytes: oldVersion.sizeBytes,
      mimeType: oldVersion.mimeType,
      currentVersion: { increment: 1 },
      updatedAt: new Date(),
    },
  });

  await logActivity(userId, 'restore', {
    fileName: file.name,
    details: `Restored version ${versionNumber} → now version ${updated.currentVersion}`,
  });

  return NextResponse.json({
    ok: true,
    file: {
      id: updated.id,
      currentVersion: updated.currentVersion,
      sizeBytes: updated.sizeBytes.toString(),
    },
  });
}

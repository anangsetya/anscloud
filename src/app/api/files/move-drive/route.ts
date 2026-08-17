// File: src/app/api/files/move-drive/route.ts
// BARU — pindah file antar drive account dengan opsi pilih folder

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { storeFile, readFile, deleteFile } from '@/lib/storage';
import { logActivity } from '@/lib/activity';
import { requireUserId } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * POST /api/files/move-drive
 * Body: {
 *   fileIds: string[],
 *   targetAccountId: string,
 *   targetDrivePath?: string,   // folder path di Drive tujuan
 *   autoGroup?: boolean,         // true = otomatis kelompokkan berdasarkan jenis
 * }
 *
 * Untuk auto-group, folder otomatis dibuat berdasarkan tipe file:
 *   - image/* → "Gambar"
 *   - video/* → "Video"
 *   - audio/* → "Audio"
 *   - application/pdf → "Dokumen PDF"
 *   - text/* atau document → "Dokumen"
 *   - spreadsheet/excel/csv → "Spreadsheet"
 *   - lainnya → "Lainnya"
 */
export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const fileIds: string[] = body.fileIds ?? [];
  const targetAccountId = String(body.targetAccountId ?? '');
  const targetDrivePath = body.targetDrivePath ? String(body.targetDrivePath) : null;
  const autoGroup = !!body.autoGroup;

  if (fileIds.length === 0) {
    return NextResponse.json({ error: 'Pilih minimal satu file.' }, { status: 400 });
  }
  if (!targetAccountId) {
    return NextResponse.json({ error: 'targetAccountId wajib diisi.' }, { status: 400 });
  }

  // Validate target account
  const targetAccount = await db.driveAccount.findFirst({
    where: { id: targetAccountId, userId },
  });
  if (!targetAccount) {
    return NextResponse.json({ error: 'Akun tujuan tidak ditemukan.' }, { status: 404 });
  }

  // Get all files to move
  const files = await db.virtualFile.findMany({
    where: { id: { in: fileIds }, userId, deletedAt: null },
    include: { driveAccount: true },
  });

  if (files.length === 0) {
    return NextResponse.json({ error: 'File tidak ditemukan.' }, { status: 404 });
  }

  let moved = 0;
  let failed = 0;

  for (const file of files) {
    try {
      // Skip if already in target account
      if (file.driveAccountId === targetAccountId) {
        moved++;
        continue;
      }

      // 1. Download from source
      const data = await readFile(file.driveAccount, file.physicalFileId);

      // 2. Determine folder path
      let finalDrivePath = targetDrivePath;
      if (autoGroup || !finalDrivePath) {
        const groupFolder = categorizeToFolder(file.mimeType);
        if (autoGroup) {
          finalDrivePath = groupFolder;
        } else if (!finalDrivePath) {
          finalDrivePath = null;
        }
      }

      // 3. Upload to target
      const result = await storeFile(targetAccount, {
        name: file.name,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        data,
      });

      // 4. Update VirtualFile record
      await db.virtualFile.update({
        where: { id: file.id },
        data: {
          driveAccountId: targetAccountId,
          physicalFileId: result.physicalFileId,
          drivePath: finalDrivePath,
        },
      });

      moved++;
    } catch (err) {
      console.error(`Failed to move file ${file.id}:`, err);
      failed++;
    }
  }

  await logActivity(userId, 'move_drive', {
    fileName: `${moved} file`,
    details: `Dipindah ke ${targetAccount.email}${targetDrivePath ? `/${targetDrivePath}` : ''}${autoGroup ? ' (auto-group)' : ''}`,
  });

  return NextResponse.json({
    ok: true,
    moved,
    failed,
    message: `${moved} file dipindahkan ke ${targetAccount.email}${failed > 0 ? `, ${failed} gagal` : ''}`,
  });
}

function categorizeToFolder(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'Gambar';
  if (mimeType.startsWith('video/')) return 'Video';
  if (mimeType.startsWith('audio/')) return 'Audio';
  if (mimeType === 'application/pdf') return 'Dokumen PDF';
  if (
    mimeType.includes('document') ||
    mimeType.includes('word') ||
    mimeType.startsWith('text/')
  ) return 'Dokumen';
  if (
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel') ||
    mimeType.includes('csv')
  ) return 'Spreadsheet';
  if (
    mimeType.includes('presentation') ||
    mimeType.includes('powerpoint')
  ) return 'Presentasi';
  if (
    mimeType.includes('zip') ||
    mimeType.includes('compressed') ||
    mimeType.includes('rar') ||
    mimeType.includes('7z') ||
    mimeType.includes('tar')
  ) return 'Arsip';
  return 'Lainnya';
}

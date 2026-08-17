import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { storeFile, formatBytes } from '@/lib/storage';
import { requireUserId } from '@/lib/session';

/**
 * POST /api/seed-demo
 *
 * Seeds the current user's account with 3 demo Google Drive accounts and
 * sample files. Only works if the user is logged in.
 */
export async function POST() {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Idempotent: skip if any demo accounts already exist for this user.
  const existing = await db.driveAccount.findFirst({
    where: { userId, email: 'personal.demo@gmail.com' },
  });
  if (existing) {
    return NextResponse.json({ ok: true, alreadySeeded: true });
  }

  const demoAccounts = [
    { email: 'personal.demo@gmail.com', displayName: 'Akun Pribadi', avatarColor: '#0A84FF' },
    { email: 'work.demo@gmail.com', displayName: 'Akun Kantor', avatarColor: '#FF9500' },
    { email: 'archive.demo@gmail.com', displayName: 'Akun Arsip', avatarColor: '#AF52DE' },
  ];

  const created = [];
  for (const a of demoAccounts) {
    const acc = await db.driveAccount.create({
      data: {
        userId,
        email: a.email,
        displayName: a.displayName,
        avatarColor: a.avatarColor,
        provider: 'local',
        totalBytes: 15n * 1024n * 1024n * 1024n,
      },
    });
    created.push(acc);
  }

  const samples: Array<{
    accountId: number;
    name: string;
    mimeType: string;
    sizeMB: number;
    content: string;
  }> = [
    { accountId: 0, name: 'Foto Liburan Bali.zip', mimeType: 'application/zip', sizeMB: 4200, content: 'dummy' },
    { accountId: 0, name: 'Resep Keluarga.pdf', mimeType: 'application/pdf', sizeMB: 1800, content: 'Resep keluarga warisan nenek.' },
    { accountId: 0, name: 'Tugas Kuliah.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sizeMB: 1800, content: 'Tugas akhir kuliah.' },
    { accountId: 1, name: 'Presentasi Q3.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', sizeMB: 5400, content: 'Slide deck Q3.' },
    { accountId: 1, name: 'Backup Database.sql', mimeType: 'application/sql', sizeMB: 6700, content: 'Dump database backup.' },
    { accountId: 2, name: 'Dokumen Lama.zip', mimeType: 'application/zip', sizeMB: 1200, content: 'Arsip dokumen 2018-2020.' },
  ];

  let totalSeededBytes = 0n;
  for (const s of samples) {
    const account = created[s.accountId];
    const sizeBytes = BigInt(s.sizeMB) * 1024n * 1024n;
    const data = Buffer.from(s.content, 'utf-8');
    const { physicalFileId } = await storeFile(account, {
      name: s.name,
      mimeType: s.mimeType,
      sizeBytes,
      data,
    });
    await db.virtualFile.create({
      data: {
        userId,
        name: s.name,
        mimeType: s.mimeType,
        sizeBytes,
        driveAccountId: account.id,
        physicalFileId,
      },
    });
    totalSeededBytes += sizeBytes;
  }

  return NextResponse.json({
    ok: true,
    seeded: {
      accounts: created.length,
      files: samples.length,
      totalBytes: totalSeededBytes.toString(),
      totalFormatted: formatBytes(totalSeededBytes),
    },
  });
}


// File: src/app/api/download/route.ts
// NEW — missing download endpoint that was causing preview download button to fail.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readFile } from '@/lib/storage';
import { requireUserId } from '@/lib/session';

/**
 * GET /api/download?id=...
 *
 * Streams the raw file bytes from the underlying storage provider
 * (local fs, Supabase, or Google Drive) back to the browser with
 * Content-Disposition: attachment so the browser downloads it.
 */
export async function GET(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'ID file wajib diisi.' }, { status: 400 });
  }

  // Find the virtual file with its drive account.
  const file = await db.virtualFile.findFirst({
    where: { id, userId, deletedAt: null },
    include: { driveAccount: true },
  });

  if (!file) {
    return NextResponse.json({ error: 'File tidak ditemukan.' }, { status: 404 });
  }

  try {
    const buffer = await readFile(file.driveAccount, file.physicalFileId);

    // Sanitize the filename for the Content-Disposition header.
    const safeName = file.name
      .replace(/[^\x20-\x7E]/g, '_') // replace non-printable chars
      .replace(/"/g, '\\"');

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Content-Length': String(buffer.length),
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (err) {
    console.error(`[download] Failed to read file ${file.id}:`, err);
    return NextResponse.json(
      {
        error: `Gagal membaca file: ${err instanceof Error ? err.message : 'Unknown error'}`,
      },
      { status: 500 }
    );
  }
}

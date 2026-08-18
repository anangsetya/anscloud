import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readFile } from '@/lib/storage';
import { requireUserId } from '@/lib/session';

/**
 * GET /api/files/preview?id=...
 * Returns file content with Content-Disposition: inline (browser displays it).
 * Used by FilePreviewDialog for images, PDFs, videos, audio, text files.
 *
 * Max preview size: 50 MB. Larger files must use the Download button.
 */
const MAX_PREVIEW_BYTES = 50n * 1024n * 1024n;

export async function GET(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID wajib diisi.' }, { status: 400 });

  const file = await db.virtualFile.findFirst({
    where: { id, userId },
    include: { driveAccount: true },
  });
  if (!file) return NextResponse.json({ error: 'File tidak ditemukan.' }, { status: 404 });

  if (file.sizeBytes > MAX_PREVIEW_BYTES) {
    return NextResponse.json(
      {
        error: `File terlalu besar untuk preview (${(Number(file.sizeBytes) / 1024 / 1024).toFixed(1)} MB). Maks 50 MB.`,
      },
      { status: 413 }
    );
  }

  try {
    const data = await readFile(file.driveAccount, file.physicalFileId);
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': file.mimeType,
        'Content-Length': String(data.length),
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.name)}"`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Gagal membaca file.' },
      { status: 500 }
    );
  }
}

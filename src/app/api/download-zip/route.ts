import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readFile } from '@/lib/storage';
import { requireUserId } from '@/lib/session';
import { ZipArchive } from 'archiver';

/**
 * POST /api/download-zip
 * Body: { ids: string[], folderName?: string }
 *
 * Streams a ZIP archive of multiple files to the client. Files are read
 * from their underlying storage provider (local fs or Google Drive) and
 * piped into the archive on-the-fly — no temp files.
 *
 * Used by the bulk action "Download as ZIP" in the file browser.
 */
export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  const folderName = String(body.folderName ?? 'anscloud-files').trim() || 'anscloud-files';

  if (ids.length === 0) {
    return NextResponse.json({ error: 'Pilih minimal 1 file.' }, { status: 400 });
  }

  const files = await db.virtualFile.findMany({
    where: { id: { in: ids }, userId, deletedAt: null },
    include: { driveAccount: true },
  });

  if (files.length === 0) {
    return NextResponse.json({ error: 'File tidak ditemukan.' }, { status: 404 });
  }

  // Build ZIP stream
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];

  archive.on('data', (chunk: Buffer) => {
    chunks.push(new Uint8Array(chunk));
  });

  // Append each file to the archive.
  for (const file of files) {
    try {
      const data = await readFile(file.driveAccount, file.physicalFileId);
      archive.append(data, { name: file.name });
    } catch (err) {
      console.error(`Failed to read ${file.name}:`, err);
      // Skip file that failed to read, continue with the rest
      archive.append(
        encoder.encode(`Error: gagal membaca file ${file.name}.`),
        { name: `${file.name}.ERROR.txt` }
      );
    }
  }

  await archive.finalize();

  // Concatenate all chunks into a single Buffer.
  const totalSize = chunks.reduce((sum, c) => sum + c.length, 0);
  const zipBuffer = Buffer.concat(chunks, totalSize);

  const safeFolderName = folderName.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 50);
  return new NextResponse(zipBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(zipBuffer.length),
      'Content-Disposition': `attachment; filename="${safeFolderName}.zip"`,
      'Cache-Control': 'private, no-cache',
    },
  });
}

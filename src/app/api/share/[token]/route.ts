import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readFile } from '@/lib/storage';

/**
 * GET /api/share/[token]?password=...
 *
 * Public endpoint — does NOT require authentication.
 * Returns the file metadata + (if no password) the file bytes for preview/download.
 *
 * If the link has a password, the request must include `?password=...` and
 * we bcrypt-compare it before allowing access.
 *
 * Checks:
 *   - Link exists
 *   - Not expired (expiresAt)
 *   - Download limit not exceeded (downloadCount < downloadLimit)
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!token) return NextResponse.json({ error: 'Token tidak valid.' }, { status: 400 });

  const link = await db.sharedLink.findUnique({
    where: { token },
    include: { file: { include: { driveAccount: true } } },
  });

  if (!link) {
    return NextResponse.json({ error: 'Link tidak ditemukan atau sudah dicabut.' }, { status: 404 });
  }
  if (!link.file) {
    return NextResponse.json({ error: 'File terkait sudah dihapus.' }, { status: 404 });
  }

  // Check expiry
  if (link.expiresAt && link.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Link sudah kedaluwarsa.' }, { status: 410 });
  }

  // Check download limit
  if (link.downloadLimit !== null && link.downloadCount >= link.downloadLimit) {
    return NextResponse.json({ error: 'Batas download telah tercapai.' }, { status: 429 });
  }

  // Check password
  if (link.passwordHash) {
    const providedPassword = req.nextUrl.searchParams.get('password');
    if (!providedPassword) {
      return NextResponse.json(
        { error: 'Link ini dilindungi password.', needsPassword: true },
        { status: 401 }
      );
    }
    const bcrypt = await import('bcryptjs');
    const ok = await bcrypt.compare(providedPassword, link.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: 'Password salah.' }, { status: 403 });
    }
  }

  const file = link.file;

  // For files ≤ 50 MB, stream the content inline (preview).
  // For larger files, only return metadata — user must use download endpoint.
  const MAX_INLINE = 50n * 1024n * 1024n;
  const canInline = file.sizeBytes <= MAX_INLINE;

  let data: Buffer | null = null;
  if (canInline) {
    try {
      data = await readFile(file.driveAccount, file.physicalFileId);
    } catch {
      // ignore — return metadata only
    }
  }

  // Increment download count
  await db.sharedLink.update({
    where: { id: link.id },
    data: { downloadCount: { increment: 1 } },
  });

  if (data) {
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': file.mimeType,
        'Content-Length': String(data.length),
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.name)}"`,
        'Cache-Control': 'public, max-age=300',
      },
    });
  }

  // Metadata-only response (large file or read error)
  return NextResponse.json({
    file: {
      name: file.name,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes.toString(),
    },
    downloadUrl: `/api/share/${token}?download=1`,
  });
}

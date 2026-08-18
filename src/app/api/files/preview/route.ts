import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readFile } from '@/lib/storage';
import { requireUserId } from '@/lib/session';
import { google } from 'googleapis';

const MAX_PREVIEW_BYTES = 50n * 1024n * 1024n;

function isVideoMime(mime: string): boolean {
  return mime.startsWith('video/') || ['mp4', 'webm', 'mpeg', 'ogg', '3gp', 'mov'].some(ext => mime.includes(ext));
}

function isAudioMime(mime: string): boolean {
  return mime.startsWith('audio/') || ['mp3', 'wav', 'flac', 'aac', 'm4a', 'wma', 'opus'].some(ext => mime.includes(ext));
}

/**
 * Build an OAuth2 client and return a fresh access token.
 */
async function getFreshAccessToken(account: { accessToken: string | null; refreshToken: string | null; tokenExpiresAt: Date | null; id: string }): Promise<string> {
  const publicUrl = process.env.ANSCLOUD_PUBLIC_URL || 'http://localhost:3000';
  const redirectUri = `${publicUrl}/api/auth/google/callback`;
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
  oauth2Client.setCredentials({
    access_token: account.accessToken ?? undefined,
    refresh_token: account.refreshToken ?? undefined,
    expiry_date: account.tokenExpiresAt ? account.tokenExpiresAt.getTime() : undefined,
  });

  // Persist refreshed tokens
  oauth2Client.on('tokens', async (tokens) => {
    const data: Record<string, unknown> = {};
    if (tokens.access_token) data.accessToken = tokens.access_token;
    if (tokens.refresh_token) data.refreshToken = tokens.refresh_token;
    if (tokens.expiry_date) data.tokenExpiresAt = new Date(tokens.expiry_date);
    if (Object.keys(data).length > 0) {
      await db.driveAccount.update({ where: { id: account.id }, data });
    }
  });

  await oauth2Client.getAccessToken();
  const creds = oauth2Client.getCredentials();
  if (!creds.access_token) throw new Error('Gagal mendapatkan akses token Google.');
  return creds.access_token;
}

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

  const isVideo = isVideoMime(file.mimeType);
  const isAudio = isAudioMime(file.mimeType);

  // ── Video/audio on Google Drive: stream proxy (no size limit) ──
  if ((isVideo || isAudio) && file.driveAccount.provider === 'google') {
    try {
      const token = await getFreshAccessToken(file.driveAccount);

      // Forward Range header for video seeking
      const gHeaders: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };
      const rangeHeader = req.headers.get('range');
      if (rangeHeader) gHeaders['Range'] = rangeHeader;

      const gResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${file.physicalFileId}?alt=media`,
        { headers: gHeaders }
      );

      if (!gResponse.ok) {
        return NextResponse.json(
          { error: `Gagal mengambil file dari Google Drive (HTTP ${gResponse.status}).` },
          { status: gResponse.status }
        );
      }

      // Build response headers — forward Content-Range, Content-Length for seeking
      const respHeaders: Record<string, string> = {
        'Content-Type': gResponse.headers.get('content-type') || file.mimeType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=60',
      };
      const cr = gResponse.headers.get('content-range');
      if (cr) respHeaders['Content-Range'] = cr;
      const cl = gResponse.headers.get('content-length');
      if (cl) respHeaders['Content-Length'] = cl;

      // Stream the response body directly (no buffering)
      return new NextResponse(gResponse.body as ReadableStream, {
        status: gResponse.status,
        headers: respHeaders,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Gagal streaming file.' },
        { status: 500 }
      );
    }
  }

  // ── Other files: proxy through server (50 MB limit) ──
  if (file.sizeBytes > MAX_PREVIEW_BYTES) {
    return NextResponse.json(
      { error: `File terlalu besar untuk preview (${(Number(file.sizeBytes) / 1024 / 1024).toFixed(1)} MB). Maks 50 MB. Gunakan Download.` },
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

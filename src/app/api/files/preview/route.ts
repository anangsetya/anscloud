import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readFile } from '@/lib/storage';
import { requireUserId } from '@/lib/session';
import { google } from 'googleapis';

/**
 * GET /api/files/preview?id=...
 * Returns file content with Content-Disposition: inline (browser displays it).
 * Used by FilePreviewDialog for images, PDFs, videos, audio, text files.
 *
 * Max preview size for proxy: 50 MB. 
 * Video/audio on Google Drive: redirected to stream directly from Google (no size limit).
 */
const MAX_PREVIEW_BYTES = 50n * 1024n * 1024n;

function isVideoMime(mime: string): boolean {
  return mime.startsWith('video/') || ['mp4', 'webm', 'mpeg', 'ogg', '3gp', 'mov'].some(ext => mime.includes(ext));
}

function isAudioMime(mime: string): boolean {
  return mime.startsWith('audio/') || ['mp3', 'wav', 'flac', 'aac', 'm4a', 'wma', 'opus'].some(ext => mime.includes(ext));
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

  // ── Video/audio on Google Drive: redirect to direct stream (no size limit) ──
  if ((isVideo || isAudio) && file.driveAccount.provider === 'google') {
    try {
      const account = file.driveAccount;
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

      // Auto-refresh if expired, then get fresh token
      await oauth2Client.getAccessToken();
      const credentials = oauth2Client.getCredentials();
      const token = credentials.access_token;
      if (!token) {
        return NextResponse.json({ error: 'Gagal mendapatkan akses token.' }, { status: 401 });
      }

      const streamUrl = `https://www.googleapis.com/drive/v3/files/${file.physicalFileId}?alt=media&access_token=${token}`;
      return NextResponse.redirect(streamUrl);
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
      {
        error: `File terlalu besar untuk preview (${(Number(file.sizeBytes) / 1024 / 1024).toFixed(1)} MB). Maks 50 MB. Gunakan Download.`,
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

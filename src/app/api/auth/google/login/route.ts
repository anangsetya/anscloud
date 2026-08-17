// File: src/app/api/auth/google/login/route.ts
// REPLACE file lama dengan ini

import { NextRequest, NextResponse } from 'next/server';
import { getGoogleAuthUrl, isGoogleOAuthConfigured } from '@/lib/google-config';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * GET /api/auth/google/login
 *
 * Redirects the user to Google's OAuth consent screen to authorize AnsCloud
 * to access their Google Drive with FULL scope (read/upload/download/delete
 * any file in their Drive).
 *
 * After consent, Google redirects to /api/auth/google/callback with an
 * authorization code, which we exchange for access + refresh tokens.
 *
 * Query params:
 *   - returnTo: optional path to redirect to after successful connection
 *               (e.g. "/?view=accounts")
 *
 * Requires GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET env vars. If not set,
 * returns 400 with a helpful error message.
 */
export async function GET(req: NextRequest) {
  // Must be logged in to connect a Google account
  const session = await getServerSession(authOptions);
   if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized — silakan login dulu' }, { status: 401 });
  }

  if (!isGoogleOAuthConfigured()) {
    return NextResponse.json(
      {
        error:
          'Google OAuth belum dikonfigurasi di server. Set GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET di environment variables. Lihat tab "Akun Google" untuk instruksi lengkap.',
      },
      { status: 400 }
    );
  }

  // Compute redirect URI based on the request origin (or ANSCLOUD_PUBLIC_URL override).
  const publicUrl =
    process.env.ANSCLOUD_PUBLIC_URL ||
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const redirectUri = `${publicUrl}/api/auth/google/callback`;

  const returnTo = req.nextUrl.searchParams.get('returnTo') || '/';
  const state = Buffer.from(
    JSON.stringify({ returnTo, userId: session.user.id })
  ).toString('base64url');

  const authUrl = getGoogleAuthUrl(redirectUri, state);
  return NextResponse.redirect(authUrl);
}

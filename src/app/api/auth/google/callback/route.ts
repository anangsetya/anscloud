// File: src/app/api/auth/google/callback/route.ts
// REPLACE file lama dengan ini

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { db } from '@/lib/db';
import { isGoogleOAuthConfigured } from '@/lib/google-config';
import { refreshAccountQuota } from '@/lib/storage';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * GET /api/auth/google/callback?code=...&state=...
 *
 * Google redirects here after the user grants (or denies) consent.
 *
 * Flow:
 *   0. Decode state → extract userId (from login route) + returnTo.
 *   1. Exchange `code` for access_token + refresh_token via OAuth2 client.
 *   2. Fetch the user's Google profile (email, name) via oauth2.userinfo.
 *   3. Upsert DriveAccount with provider='google' and the tokens.
 *   4. Fetch the live Drive quota and persist it.
 *   5. Redirect back to the UI (returnTo from state, default "/?view=accounts").
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const stateParam = searchParams.get('state');

  // Parse state to get userId + returnTo
  let returnTo = '/?view=accounts';
  let userId: string | null = null;

  if (stateParam) {
    try {
      const decoded = JSON.parse(Buffer.from(stateParam, 'base64url').toString('utf-8'));
      if (decoded.returnTo) returnTo = decoded.returnTo;
      if (decoded.userId) userId = decoded.userId;
    } catch {
      // ignore malformed state
    }
  }

  // Fallback: try to get userId from session if not in state
  if (!userId) {
    const session = await getServerSession(authOptions);
    userId = session?.user?.id || null;
  }

  // Handle user-denied consent
  if (error) {
    return NextResponse.redirect(
      new URL(`/?oauth_error=${encodeURIComponent(error)}&view=accounts`, req.nextUrl.origin)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/?oauth_error=missing_code&view=accounts', req.nextUrl.origin)
    );
  }

  if (!userId) {
    return NextResponse.redirect(
      new URL('/?oauth_error=no_user_session&view=accounts', req.nextUrl.origin)
    );
  }

  if (!isGoogleOAuthConfigured()) {
    return NextResponse.redirect(
      new URL('/?oauth_error=not_configured&view=accounts', req.nextUrl.origin)
    );
  }

  const publicUrl =
    process.env.ANSCLOUD_PUBLIC_URL ||
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const redirectUri = `${publicUrl}/api/auth/google/callback`;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );

  // 1. Exchange code for tokens
  let tokens;
  try {
    const tokenResponse = await oauth2Client.getToken(code);
    tokens = tokenResponse.tokens;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.redirect(
      new URL(`/?oauth_error=${encodeURIComponent('token_exchange_failed:' + msg)}&view=accounts`, req.nextUrl.origin)
    );
  }

  if (!tokens.access_token || !tokens.refresh_token) {
    return NextResponse.redirect(
      new URL('/?oauth_error=no_refresh_token&view=accounts', req.nextUrl.origin)
    );
  }

  // 2. Fetch user profile (email, name)
  oauth2Client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  let profile;
  try {
    const profileRes = await oauth2.userinfo.get();
    profile = profileRes.data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.redirect(
      new URL(`/?oauth_error=${encodeURIComponent('profile_fetch_failed:' + msg)}&view=accounts`, req.nextUrl.origin)
    );
  }

  const email = (profile.email || '').toLowerCase().trim();
  const displayName = profile.name || email.split('@')[0] || 'Akun Google';

  if (!email) {
    return NextResponse.redirect(
      new URL('/?oauth_error=no_email&view=accounts', req.nextUrl.origin)
    );
  }

  // 3. Upsert DriveAccount — use findFirst with compound userId+email
  const existing = await db.driveAccount.findFirst({
    where: { userId, email },
  });

  const color = pickColorForEmail(email);

  const data = {
    userId,
    email,
    displayName,
    avatarColor: color,
    provider: 'google',
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
  };

  let account;
  if (existing) {
    account = await db.driveAccount.update({ where: { id: existing.id }, data });
  } else {
    account = await db.driveAccount.create({
      data: { ...data, totalBytes: 15n * 1024n * 1024n * 1024n },
    });
  }

  // 4. Fetch the live Drive quota and persist it (best-effort)
  try {
    await refreshAccountQuota(account.id);
  } catch (err) {
    console.warn('[google-callback] Failed to fetch quota:', err);
  }

  // 5. Redirect back to the UI
  const successUrl = new URL(
    `/?oauth_success=connected&email=${encodeURIComponent(email)}&view=accounts`,
    req.nextUrl.origin
  );
  return NextResponse.redirect(successUrl);
}

const COLORS = [
  '#6366f1', '#8b5cf6', '#a78bfa', '#f59e0b',
  '#ef4444', '#ec4899', '#14b8a6', '#f97316',
];

function pickColorForEmail(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = ((hash << 5) - hash) + email.charCodeAt(i);
    hash |= 0;
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

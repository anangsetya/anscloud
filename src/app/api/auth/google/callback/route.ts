import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { db } from '@/lib/db';
import { isGoogleOAuthConfigured } from '@/lib/google-config';
import { getUserId } from '@/lib/session';
import { refreshAccountQuota } from '@/lib/storage';

/**
 * GET /api/auth/google/callback?code=...&state=...
 *
 * Google redirects here after the user grants (or denies) consent.
 *
 * Flow:
 *   1. Get the logged-in user's ID from NextAuth session.
 *   2. Exchange `code` for access_token + refresh_token via OAuth2 client.
 *   3. Fetch the user's Google profile (email, name) via oauth2.userinfo.
 *   4. Upsert DriveAccount with provider='google' and the tokens,
 *      properly scoped to the current user (userId).
 *   5. Fetch the live Drive quota and persist it.
 *   6. Redirect back to the UI (returnTo from state, default "/?view=accounts").
 *
 * If the user denies consent, Google sends `error=access_denied` — we surface
 * that to the UI as a friendly message.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const stateParam = searchParams.get('state');

  // Parse state to get returnTo (default "/")
  let returnTo = '/?view=accounts';
  if (stateParam) {
    try {
      const decoded = JSON.parse(Buffer.from(stateParam, 'base64url').toString('utf-8'));
      if (decoded.returnTo) returnTo = decoded.returnTo;
    } catch {
      // ignore malformed state, use default
    }
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

  if (!isGoogleOAuthConfigured()) {
    return NextResponse.redirect(
      new URL('/?oauth_error=not_configured&view=accounts', req.nextUrl.origin)
    );
  }

  // ── 1. Get the logged-in user's ID ───────────────────
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.redirect(
      new URL('/?oauth_error=not_logged_in&view=accounts', req.nextUrl.origin)
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

  // 2. Exchange code for tokens
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

  // 3. Fetch user profile (email, name)
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

  // 4. Upsert DriveAccount — scoped to current user
  //    Use findFirst because schema has @@unique([userId, email]), not @unique on email alone.
  const existing = await db.driveAccount.findFirst({
    where: { userId, email },
  });

  // Assign a deterministic color based on email hash so the same account
  // always gets the same color across reconnects.
  const color = pickColorForEmail(email);

  const data = {
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
    // Re-connect: update tokens but keep existing files & folder assignment.
    account = await db.driveAccount.update({ where: { id: existing.id }, data });
  } else {
    // New connection: create with default 15 GB quota placeholder; will be
    // overwritten with the real quota from Drive API in the next step.
    account = await db.driveAccount.create({
      data: {
        userId,
        ...data,
        totalBytes: 15n * 1024n * 1024n * 1024n,
      },
    });
  }

  // 5. Fetch the live Drive quota and persist it (best-effort — if this fails
  // we still redirect with success, the UI will show the placeholder quota).
  try {
    await refreshAccountQuota(account.id);
  } catch (err) {
    console.warn('[google-callback] Failed to fetch quota:', err);
    // non-fatal
  }

  // 6. Redirect back to the UI
  const successUrl = new URL(`/?oauth_success=connected&email=${encodeURIComponent(email)}&view=accounts`, req.nextUrl.origin);
  return NextResponse.redirect(successUrl);
}

const COLORS = [
  '#10b981', '#f59e0b', '#8b5cf6', '#ef4444',
  '#3b82f6', '#ec4899', '#14b8a6', '#f97316',
];

function pickColorForEmail(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = ((hash << 5) - hash) + email.charCodeAt(i);
    hash |= 0; // convert to 32-bit int
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

import { google } from 'googleapis';

/**
 * Google OAuth configuration helper.
 *
 * AnsCloud uses the FULL Drive scope (https://www.googleapis.com/auth/drive)
 * so it can read, upload, download, and delete ALL files in the user's Drive —
 * not just files created by AnsCloud.
 *
 * To enable real Google Drive:
 *   1. Create a project at https://console.cloud.google.com/
 *   2. Enable "Google Drive API" and "Google Picker API"
 *   3. Create OAuth 2.0 Client ID (Web application) at APIs & Services → Credentials
 *   4. Add authorized redirect URI: <your-domain>/api/auth/google/callback
 *   5. Set environment variables:
 *        GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
 *        GOOGLE_CLIENT_SECRET=xxxxx
 *      Optionally set:
 *        ANSCLOUD_PUBLIC_URL=https://drive.yourdomain.com
 *      (used to compute the redirect URI; falls back to request origin)
 */

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export function isGoogleOAuthConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function getGoogleOAuthClient(redirectUri: string) {
  if (!isGoogleOAuthConfigured()) {
    throw new Error(
      'Google OAuth belum dikonfigurasi. Set GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET di environment.'
    );
  }
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

export function getGoogleAuthUrl(redirectUri: string, state?: string): string {
  const oauth2Client = getGoogleOAuthClient(redirectUri);
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // force consent screen so we always get a refresh_token
    state,
  });
}

export { SCOPES };

import { NextResponse } from 'next/server';
import { isGoogleOAuthConfigured } from '@/lib/google-config';

/**
 * GET /api/accounts/oauth-status
 *
 * Returns whether real Google OAuth is configured on this server.
 * The UI uses this to show/hide the "Connect Google Account (Real)" button.
 */
export async function GET() {
  return NextResponse.json({
    configured: isGoogleOAuthConfigured(),
  });
}

import { withAuth } from 'next-auth/middleware';

/**
 * Middleware — protects all routes except:
 *   - /login           (login page)
 *   - /register        (register page)
 *   - /share/*         (public shared file links)
 *   - /api/auth/*      (NextAuth: signin, signout, callback, register)
 *   - /api/share/*     (public share access API)
 *
 * Everything else (including /, /dashboard, /api/accounts, /api/files,
 * /api/upload, etc.) requires a valid session.
 */
export default withAuth({
  pages: {
    signIn: '/login',
  },
});

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - /login, /register — auth pages
     * - /share and /share/* — public shared links
     * - /api/auth — NextAuth handler
     * - /api/auth/register — register endpoint
     * - /api/share — public share access
     * - /_next/static, /_next/image, /favicon.ico, /favicon.svg — Next.js internals & favicons
     * - /logo.svg, /robots.txt — public assets
     */
    '/((?!login|register|share|download-source|api/auth|api/share|api/download-source|_next/static|_next/image|favicon.ico|favicon.svg|logo.svg|robots.txt).*)',
  ],
};

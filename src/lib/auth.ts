import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { db } from './db';

/**
 * NextAuth configuration for AnsCloud — multi-user mode.
 *
 * Users are stored in the `User` table (Prisma). Passwords are bcrypt-hashed.
 * Registration happens via /api/auth/register — POST { email, password, name }.
 *
 * Each user has their own connected Google accounts, files, folders, etc.
 * All API routes filter by `userId` from the session.
 */

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'AnsCloud Login',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'user@example.com' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email.trim().toLowerCase();
        const user = await db.user.findUnique({ where: { email } });
        if (!user) return null;

        // Dynamic import — keep bcrypt out of the Edge-runtime middleware bundle.
        const bcrypt = await import('bcryptjs');
        const passwordOk = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!passwordOk) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
      }
      return session;
    },
  },
};

// Extend the default NextAuth Session type to include `user.id`.
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
  }
}

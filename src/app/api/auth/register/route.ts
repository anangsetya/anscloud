import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * POST /api/auth/register
 * Body: { email, password, name }
 *
 * Registers a new user. Password is hashed with bcrypt (salt rounds 12)
 * before storing in DB. Returns 409 if email already exists.
 *
 * After registration, the frontend calls signIn('credentials') automatically
 * to log the user in.
 */
const MIN_PASSWORD_LENGTH = 8;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const name = String(body.name ?? '').trim();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Email tidak valid.' }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: 'Nama wajib diisi.' }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password minimal ${MIN_PASSWORD_LENGTH} karakter.` },
      { status: 400 }
    );
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'Email sudah terdaftar.' }, { status: 409 });
  }

  const bcrypt = await import('bcryptjs');
  const passwordHash = bcrypt.hashSync(password, 12);

  const user = await db.user.create({
    data: { email, name, passwordHash },
    select: { id: true, email: true, name: true },
  });

  return NextResponse.json({ user });
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

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
  const passwordHash = bcrypt.hashSync(password, 8);

  const user = await db.user.create({
    data: { email, name, passwordHash },
    select: { id: true, email: true, name: true },
  });

  return NextResponse.json({ user });
}
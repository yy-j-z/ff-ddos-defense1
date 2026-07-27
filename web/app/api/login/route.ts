import { NextResponse } from 'next/server';
import { AUTH_COOKIE, verifyCredentials, sessionToken } from '@/lib/auth';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const { username, password } = body as { username?: unknown; password?: unknown };

  if (!verifyCredentials(username, password)) {
    return NextResponse.json({ error: '账号或密码错误' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await sessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 天
    secure: false
  });
  return res;
}

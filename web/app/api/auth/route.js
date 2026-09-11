import { cookies } from 'next/headers';
import { token, cookieName } from '@/lib/auth';

export async function POST(req) {
  const { password } = await req.json();
  const local = (req.headers.get('host') || '').startsWith('localhost');
  if (password !== process.env.APP_PASSWORD) return new Response(JSON.stringify({ ok: false }), { status: 401 });
  const c = await cookies();
  c.set(cookieName(), token(), { httpOnly: true, secure: !local, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 90 });
  return Response.json({ ok: true });
}

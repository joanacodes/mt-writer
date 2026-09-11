import { cookies } from 'next/headers';
import { issue, cookieName, passwordMatches } from '@/lib/auth';

const attempts = new Map(); // ip -> [timestamps]; resets when the function instance recycles, which is fine
export async function POST(req) {
  const ip = req.headers.get('x-forwarded-for') || 'local';
  const now = Date.now(); const recent = (attempts.get(ip) || []).filter((t) => now - t < 15 * 60e3);
  if (recent.length >= 8) return new Response(JSON.stringify({ ok: false, error: 'Too many attempts. Wait fifteen minutes.' }), { status: 429 });
  const { password } = await req.json();
  if (!passwordMatches(password)) { attempts.set(ip, [...recent, now]); await new Promise((r) => setTimeout(r, 600)); return new Response(JSON.stringify({ ok: false }), { status: 401 }); }
  attempts.delete(ip);
  const local = (req.headers.get('host') || '').startsWith('localhost');
  const c = await cookies();
  c.set(cookieName(), issue(), { httpOnly: true, secure: !local, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 90 });
  return Response.json({ ok: true });
}
export async function DELETE() {
  const c = await cookies(); c.delete(cookieName());
  return Response.json({ ok: true });
}

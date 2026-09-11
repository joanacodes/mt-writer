import { cookies } from 'next/headers';
import crypto from 'crypto';

const COOKIE = 'mt_auth';
export function token() {
  return crypto.createHmac('sha256', process.env.AUTH_SECRET || 'dev').update(process.env.APP_PASSWORD || 'dev').digest('hex');
}
export async function isAuthed() {
  const c = await cookies();
  return c.get(COOKIE)?.value === token();
}
export function cookieName() { return COOKIE; }
export function unauthorized() {
  return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
}

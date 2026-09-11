import { cookies } from 'next/headers';
import crypto from 'crypto';

const COOKIE = 'mt_auth';
const DAYS = 90;
const secret = () => process.env.AUTH_SECRET || 'dev-secret-change-me';

/** Signed, expiring token: "<expiry>.<hmac>". No password material inside. */
export function issue() {
  const exp = Date.now() + DAYS * 864e5;
  const sig = crypto.createHmac('sha256', secret()).update(String(exp)).digest('hex');
  return `${exp}.${sig}`;
}
function valid(tok) {
  if (!tok || !tok.includes('.')) return false;
  const [exp, sig] = tok.split('.');
  if (Number(exp) < Date.now()) return false;
  const good = crypto.createHmac('sha256', secret()).update(String(exp)).digest('hex');
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}
export async function isAuthed() {
  const c = await cookies();
  return valid(c.get(COOKIE)?.value);
}
export function isAuthedRequest(req) {
  const m = /(?:^|;\s*)mt_auth=([^;]+)/.exec(req.headers.get('cookie') || '');
  return valid(m ? decodeURIComponent(m[1]) : null);
}
export function passwordMatches(p) {
  const a = Buffer.from(String(p || '')), b = Buffer.from(process.env.APP_PASSWORD || '');
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}
export function cookieName() { return COOKIE; }
export function unauthorized() {
  return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
}
/** The cron route is reachable by the scheduler with CRON_SECRET, or by the logged-in app. */
export function cronAllowed(req) {
  const key = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (key && (url.searchParams.get('key') === key || bearer === key)) return true;
  return isAuthedRequest(req);
}

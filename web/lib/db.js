import { createClient } from '@supabase/supabase-js';

let _db = null;
/** Lazy so the build doesn't need the keys. */
export function client() {
  if (!_db) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase environment variables are missing.');
    _db = createClient(url, key, { auth: { persistSession: false } });
  }
  return _db;
}
/** db.from(...) works as before, resolved at call time. */
export const db = { from: (t) => client().from(t) };

export async function log(line) {
  await db.from('logs').insert({ line: String(line).slice(0, 2000) });
}
export async function settings() {
  const { data } = await db.from('settings').select('*');
  return Object.fromEntries((data || []).map((r) => [r.key, r.value]));
}
export async function doc(name) {
  const { data } = await db.from('docs').select('content').eq('name', name).maybeSingle();
  return data?.content || '';
}

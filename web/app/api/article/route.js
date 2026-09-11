import { db } from '@/lib/db';
import { isAuthed, unauthorized } from '@/lib/auth';
import { articleCost } from '@/lib/cost';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (!(await isAuthed())) return unauthorized();
  const { searchParams } = new URL(req.url);
  const { data } = await db.from('articles').select('*').eq('plan_id', searchParams.get('id'));
  const { data: cover } = await db.from('covers').select('plan_id,slug,mime,prompt,published_at').eq('plan_id', searchParams.get('id')).maybeSingle();
  return Response.json({ articles: data || [], cover: cover || null, cost: await articleCost(searchParams.get('id')) });
}
export async function POST(req) {
  if (!(await isAuthed())) return unauthorized();
  const { id, lang, body } = await req.json();
  await db.from('articles').update({ body, edited: true, words: (body.match(/\w+/g) || []).length, updated_at: new Date().toISOString() }).eq('plan_id', id).eq('lang', lang);
  return Response.json({ ok: true });
}

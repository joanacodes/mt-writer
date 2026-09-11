import { db, log, settings } from '@/lib/db';
import { isAuthed, unauthorized } from '@/lib/auth';
import { submitBatch } from '@/lib/providers';
import { allowedPaths, systemFor, userEn } from '@/lib/prompt';

export const maxDuration = 120;

/* English only: the French adaptation needs the English text, so it runs in a second batch afterwards. */
export async function POST(req) {
  if (!(await isAuthed())) return unauthorized();
  const { ids } = await req.json();
  const st = await settings();
  if (st.provider !== 'anthropic') return Response.json({ error: 'Batch mode uses the Anthropic API. Switch provider, or use Generate.' }, { status: 400 });
  const paths = await allowedPaths();
  const system = await systemFor('en', paths);
  const today = new Date().toISOString().slice(0, 10);
  const { data: rows } = await db.from('plan').select('*').in('id', ids);
  const requests = [], items = [];
  for (const row of rows || []) {
    const custom_id = `en-${row.id}`;
    items.push({ plan_id: row.id, lang: 'en', custom_id });
    requests.push({ custom_id, params: { model: st.model, max_tokens: 6000, system, messages: [{ role: 'user', content: userEn(row, today) }] } });
  }
  if (!requests.length) return Response.json({ error: 'nothing to submit' }, { status: 400 });
  const batch = await submitBatch(requests);
  await db.from('jobs').insert({ kind: 'batch', provider: 'anthropic', batch_id: batch.id, items, status: 'submitted' });
  await db.from('plan').update({ status_en: 'queued' }).in('id', ids);
  await log(`batch submitted: ${requests.length} article(s), id ${batch.id}`);
  return Response.json({ ok: true, batch: batch.id, count: requests.length });
}

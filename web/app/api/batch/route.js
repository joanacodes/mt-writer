import { db, log, settings } from '@/lib/db';
import { isAuthed, unauthorized } from '@/lib/auth';
import { submitBatch } from '@/lib/providers';
import { allowedPaths, systemFor, userEn, userFr } from '@/lib/prompt';

export const maxDuration = 120;

/* mode 'en' writes the English; mode 'fr' adapts into French the rows whose English exists. */
export async function POST(req) {
  if (!(await isAuthed())) return unauthorized();
  const { ids, mode = 'en' } = await req.json();
  const st = await settings();
  if (st.provider !== 'anthropic') return Response.json({ error: 'Batch mode uses the Anthropic API. Switch provider, or use Generate.' }, { status: 400 });
  const paths = await allowedPaths();
  const system = await systemFor(mode, paths);
  const today = new Date().toISOString().slice(0, 10);
  const { data: rows } = await db.from('plan').select('*').in('id', ids);
  const { data: enArts } = mode === 'fr' ? await db.from('articles').select('plan_id,body').eq('lang', 'en').in('plan_id', ids) : { data: [] };
  const enBy = Object.fromEntries((enArts || []).map((a) => [a.plan_id, a.body]));
  const requests = [], items = [];
  for (const row of rows || []) {
    if (mode === 'fr' && (!enBy[row.id] || !row.slug_fr)) continue;
    const custom_id = `${mode}-${row.id}`;
    items.push({ plan_id: row.id, lang: mode, custom_id });
    const content = mode === 'en' ? userEn(row, today) : userFr(row, enBy[row.id], paths, today);
    requests.push({ custom_id, params: { model: st.model, max_tokens: 6000, system, messages: [{ role: 'user', content }] } });
  }
  if (!requests.length) return Response.json({ error: 'nothing to submit' }, { status: 400 });
  const batch = await submitBatch(requests);
  await db.from('jobs').insert({ kind: 'batch', provider: 'anthropic', batch_id: batch.id, items, status: 'submitted', note: st.model });
  await db.from('plan').update({ [`status_${mode}`]: 'queued' }).in('id', items.map((i) => i.plan_id));
  await log(`batch ${mode.toUpperCase()} submitted: ${requests.length} article(s), id ${batch.id}`);
  return Response.json({ ok: true, batch: batch.id, count: requests.length });
}

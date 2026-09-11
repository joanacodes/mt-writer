import { db, log } from './db';
import { submitBatch, anthropicParams } from './providers';
import { allowedPaths, systemFor, userEn, userFr } from './prompt';

/** Submit a batch for ids in one language. chain: '' | 'fr' | 'fr+covers' | 'covers' (what to do when it lands). */
export async function submitBatchFor({ ids, mode, model, chain = '' }) {
  const paths = await allowedPaths();
  const system = await systemFor(mode, paths);
  const today = new Date().toISOString().slice(0, 10);
  const { data: rows } = await db.from('plan').select('*').in('id', ids);
  const { data: enArts } = mode === 'fr' ? await db.from('articles').select('plan_id,body').eq('lang', 'en').in('plan_id', ids) : { data: [] };
  const enBy = Object.fromEntries((enArts || []).map((a) => [a.plan_id, a.body]));
  const requests = [], items = [];
  for (const row of rows || []) {
    if (mode === 'fr' && (!enBy[row.id] || !row.slug_fr)) continue;
    if (mode === 'en' && !row.slug_en) continue;
    const custom_id = `${mode}-${row.id}`;
    items.push({ plan_id: row.id, lang: mode, custom_id });
    const content = mode === 'en' ? userEn(row, today) : userFr(row, enBy[row.id], paths, today);
    requests.push({ custom_id, params: anthropicParams({ model, system, user: content, maxTokens: 16000 }) });
  }
  if (!requests.length) return null;
  const batch = await submitBatch(requests);
  await db.from('jobs').insert({ kind: 'batch', provider: 'anthropic', batch_id: batch.id, items, status: 'submitted', note: model, chain });
  await db.from('plan').update({ [`status_${mode}`]: 'queued' }).in('id', items.map((i) => i.plan_id));
  await log(`batch ${mode.toUpperCase()} submitted: ${requests.length} article(s)${chain ? ' → then ' + chain : ''}`);
  return { id: batch.id, count: requests.length };
}

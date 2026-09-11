import { db, log } from '@/lib/db';
import { batchStatus, batchResults } from '@/lib/providers';
import { allowedPaths, stripFences } from '@/lib/prompt';
import { validate } from '@/lib/validate';
import { record, normalise } from '@/lib/cost';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/* Polls open batches and stores the finished articles. Called by Vercel Cron and by the app when it opens. */
export async function GET() {
  const { data: jobs } = await db.from('jobs').select('*').in('status', ['submitted', 'in_progress']);
  if (!jobs?.length) return Response.json({ ok: true, jobs: 0 });
  const paths = await allowedPaths();
  let stored = 0;
  for (const job of jobs) {
    const s = await batchStatus(job.batch_id);
    if (s.processing_status !== 'ended') {
      await db.from('jobs').update({ status: 'in_progress', note: JSON.stringify(s.request_counts || {}), updated_at: new Date().toISOString() }).eq('id', job.id);
      continue;
    }
    const results = await batchResults(s.results_url);
    for (const r of results) {
      const item = (job.items || []).find((i) => i.custom_id === r.custom_id);
      if (!item) continue;
      const { data: row } = await db.from('plan').select('*').eq('id', item.plan_id).maybeSingle();
      if (!row) continue;
      if (r.result?.type !== 'succeeded') {
        await db.from('plan').update({ [`status_${item.lang}`]: 'todo' }).eq('id', row.id);
        await log(`${row.id}: batch item failed (${r.result?.type})`);
        continue;
      }
      await record({ plan_id: row.id, lang: item.lang, kind: 'text_batch', provider: 'anthropic', model: r.result.message.model || job.note, usage: normalise('anthropic', r.result.message.usage), batch: true });
      const text = stripFences(r.result.message.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
      const { problems, words } = validate(text, row, item.lang, paths);
      await db.from('articles').upsert({ plan_id: row.id, lang: item.lang, slug: item.lang === 'en' ? row.slug_en : row.slug_fr, body: text, words, warnings: problems.join('; '), edited: false, updated_at: new Date().toISOString() });
      await db.from('plan').update({ [`status_${item.lang}`]: problems.length ? 'check' : 'written' }).eq('id', row.id);
      stored++;
    }
    await db.from('jobs').update({ status: 'done', updated_at: new Date().toISOString() }).eq('id', job.id);
    await log(`batch ${job.batch_id}: ${stored} article(s) stored`);
  }
  return Response.json({ ok: true, stored });
}

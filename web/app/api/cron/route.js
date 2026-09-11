import { db, log, settings, doc } from '@/lib/db';
import { batchStatus, batchResults, callImage } from '@/lib/providers';
import { allowedPaths, stripFences, frontMatter } from '@/lib/prompt';
import { validate } from '@/lib/validate';
import { record, normalise } from '@/lib/cost';
import { finish } from '@/lib/finish';
import { submitBatchFor } from '@/lib/batch';
import { cronAllowed, unauthorized } from '@/lib/auth';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/* Runs every few minutes (Supabase pg_cron) and whenever the app opens:
   1. collects finished batches and stores the articles;
   2. if a batch was chained, submits the next step (FR batch, or covers);
   3. generates a few queued covers. */
export async function GET(req) {
  if (!cronAllowed(req)) return unauthorized();
  const { data: jobs } = await db.from('jobs').select('*').in('status', ['submitted', 'in_progress']);
  const paths = await allowedPaths();
  const st = await settings();
  let stored = 0;
  for (const job of jobs || []) {
    const s = await batchStatus(job.batch_id);
    if (s.processing_status !== 'ended') {
      await db.from('jobs').update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', job.id);
      continue;
    }
    const results = await batchResults(s.results_url);
    const landed = [];
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
      let enFm = null;
      if (item.lang === 'fr') { const { data: enA } = await db.from('articles').select('body').eq('plan_id', row.id).eq('lang', 'en').maybeSingle(); enFm = enA ? frontMatter(enA.body)[0] : null; }
      const fin = finish(stripFences(r.result.message.content.filter((b) => b.type === 'text').map((b) => b.text).join('')), row, item.lang, paths, enFm);
      const text = fin.text;
      let { problems, words } = validate(text, row, item.lang, paths);
      if (r.result.message.stop_reason === 'max_tokens') problems.push('output cut at the token ceiling');
      await db.from('articles').upsert({ plan_id: row.id, lang: item.lang, slug: item.lang === 'en' ? row.slug_en : row.slug_fr, body: text, words, warnings: problems.join('; '), edited: false, updated_at: new Date().toISOString() });
      await db.from('plan').update({ [`status_${item.lang}`]: problems.length ? 'check' : 'written' }).eq('id', row.id);
      landed.push(row.id); stored++;
    }
    await db.from('jobs').update({ status: 'done', updated_at: new Date().toISOString() }).eq('id', job.id);
    await log(`batch ${job.batch_id.slice(-6)}: ${landed.length} ${job.items?.[0]?.lang?.toUpperCase() || ''} article(s) stored`);
    // chain
    const chain = job.chain || '';
    if (landed.length && chain.startsWith('fr')) {
      try { await submitBatchFor({ ids: landed, mode: 'fr', model: job.note || st.model, chain: chain.includes('covers') ? 'covers' : '' }); }
      catch (e) { await log(`chain FR failed: ${e.message}`); }
    } else if (landed.length && chain === 'covers') {
      await db.from('queue').insert(landed.map((plan_id) => ({ kind: 'cover', plan_id })));
      await log(`${landed.length} cover(s) queued`);
    }
  }
  // covers, a few per run
  const { data: q } = await db.from('queue').select('*').eq('status', 'pending').eq('kind', 'cover').order('id').limit(4);
  if (q?.length) {
    const reference = await doc('reference_jpg_base64');
    for (const item of q) {
      await db.from('queue').update({ status: 'working' }).eq('id', item.id);
      try {
        const { data: row } = await db.from('plan').select('*').eq('id', item.plan_id).maybeSingle();
        const { data: art } = await db.from('articles').select('body').eq('plan_id', item.plan_id).eq('lang', 'en').maybeSingle();
        const prompt = art ? frontMatter(art.body)[0]?.imagePrompt : null;
        if (!row || !prompt) throw new Error('no prompt');
        const b64 = await callImage({ provider: st.image_provider, model: st.image_model, prompt, referenceB64: reference || null });
        await db.from('covers').upsert({ plan_id: row.id, slug: row.slug_en, mime: 'image/jpeg', data: b64, prompt, published_at: null });
        await db.from('plan').update({ cover: 'done' }).eq('id', row.id);
        const cost = await record({ plan_id: row.id, kind: 'image', provider: st.image_provider, model: st.image_model, image: true });
        await db.from('queue').update({ status: 'done' }).eq('id', item.id);
        await log(`${row.id}: cover generated · $${cost.toFixed(3)}`);
      } catch (e) {
        await db.from('queue').update({ status: 'failed', note: e.message }).eq('id', item.id);
        await log(`${item.plan_id}: cover ERROR ${e.message}`);
      }
    }
  }
  return Response.json({ ok: true, stored, covers: q?.length || 0 });
}

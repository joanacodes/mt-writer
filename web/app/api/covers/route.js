import { db, log, settings, doc } from '@/lib/db';
import { isAuthed, unauthorized } from '@/lib/auth';
import { callImage } from '@/lib/providers';
import { frontMatter } from '@/lib/prompt';
import { record } from '@/lib/cost';

export const maxDuration = 300;

export async function POST(req) {
  if (!(await isAuthed())) return unauthorized();
  const { ids, force } = await req.json();
  const st = await settings();
  const reference = await doc('reference_jpg_base64');
  const done = [];
  for (const id of ids) {
    const { data: row } = await db.from('plan').select('*').eq('id', id).maybeSingle();
    if (!row) continue;
    const { data: existing } = await db.from('covers').select('plan_id').eq('plan_id', id).maybeSingle();
    if (existing && !force) { await log(`${id}: cover exists — skipped`); continue; }
    const { data: art } = await db.from('articles').select('body').eq('plan_id', id).eq('lang', 'en').maybeSingle();
    if (!art) { await log(`${id}: no English article — no prompt to use`); continue; }
    const [fm] = frontMatter(art.body);
    const prompt = fm?.imagePrompt;
    if (!prompt) { await log(`${id}: the article has no imagePrompt`); continue; }
    try {
      const b64 = await callImage({ provider: st.image_provider, model: st.image_model, prompt, referenceB64: reference || null });
      await db.from('covers').upsert({ plan_id: id, slug: row.slug_en, mime: 'image/jpeg', data: b64, prompt, published_at: null });
      await db.from('plan').update({ cover: 'done' }).eq('id', id);
      const cost = await record({ plan_id: id, kind: 'image', provider: st.image_provider, model: st.image_model, image: true });
      await log(`${id}: cover generated · $${cost.toFixed(3)}`);
      done.push(id);
    } catch (e) { await log(`${id}: cover ERROR ${e.message}`); }
  }
  return Response.json({ ok: true, done });
}

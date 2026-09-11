import { db, log, settings } from '@/lib/db';
import { isAuthed, unauthorized } from '@/lib/auth';
import { callText } from '@/lib/providers';
import { allowedPaths, systemFor, userEn, userFr, stripFences, expandUser } from '@/lib/prompt';
import { validate } from '@/lib/validate';
import { record, normalise } from '@/lib/cost';

export const maxDuration = 300;

async function writeOne(row, lang, paths, st, enBody) {
  const today = new Date().toISOString().slice(0, 10);
  const system = await systemFor(lang, paths);
  const user = lang === 'en' ? userEn(row, today) : userFr(row, enBody, paths, today);
  let r = await callText({ provider: st.provider, model: st.model, system, user });
  let cost = await record({ plan_id: row.id, lang, kind: 'text', provider: st.provider, model: st.model, usage: normalise(st.provider, r.usage) });
  let text = stripFences(r.text);
  let { problems, words } = validate(text, row, lang, paths);
  for (let attempt = 0; attempt < 2 && problems.length; attempt++) {
    r = await callText({ provider: st.provider, model: st.model, system, user: expandUser(lang, text, problems, Number(row.length || 900)) });
    cost += await record({ plan_id: row.id, lang, kind: 'text', provider: st.provider, model: st.model, usage: normalise(st.provider, r.usage) });
    const next = stripFences(r.text);
    const v = validate(next, row, lang, paths);
    if (v.words >= words || !v.problems.length) { text = next; ({ problems, words } = v); }
  }
  const slug = lang === 'en' ? row.slug_en : row.slug_fr;
  await db.from('articles').upsert({ plan_id: row.id, lang, slug, body: text, words, warnings: problems.join('; '), edited: false, updated_at: new Date().toISOString() });
  await db.from('plan').update({ [`status_${lang}`]: problems.length ? 'check' : 'written' }).eq('id', row.id);
  await log(`${row.id} ${lang.toUpperCase()}: ${words} words · $${cost.toFixed(3)}${problems.length ? ' ⚠ ' + problems.join('; ') : ''}`);
  return text;
}

export async function POST(req) {
  if (!(await isAuthed())) return unauthorized();
  const { ids, en, fr, force } = await req.json();
  const st = await settings();
  const paths = await allowedPaths();
  const done = [];
  for (const id of ids) {
    const { data: row } = await db.from('plan').select('*').eq('id', id).maybeSingle();
    if (!row) continue;
    const { data: existing } = await db.from('articles').select('*').eq('plan_id', id);
    const byLang = Object.fromEntries((existing || []).map((a) => [a.lang, a]));
    try {
      let enBody = byLang.en?.body;
      if (en && (!byLang.en || force || !byLang.en.edited)) enBody = await writeOne(row, 'en', paths, st);
      if (fr && row.slug_fr && (!byLang.fr || force || !byLang.fr.edited)) {
        if (!enBody) { await log(`${id}: no English article to adapt from`); }
        else await writeOne(row, 'fr', paths, st, enBody);
      }
      done.push(id);
    } catch (e) { await log(`${id}: ERROR ${e.message}`); }
  }
  return Response.json({ ok: true, done });
}

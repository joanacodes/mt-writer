import { db, log, settings } from '@/lib/db';
import { isAuthed, unauthorized } from '@/lib/auth';
import { callText } from '@/lib/providers';
import { allowedPaths, systemFor, userEn, userFr, stripFences, expandUser, frontMatter } from '@/lib/prompt';
import { validate } from '@/lib/validate';
import { record, normalise, overCap } from '@/lib/cost';
import { finish } from '@/lib/finish';

export const maxDuration = 300;

async function writeOne(row, lang, paths, st, enBody) {
  const today = new Date().toISOString().slice(0, 10);
  const system = await systemFor(lang, paths);
  const user = lang === 'en' ? userEn(row, today) : userFr(row, enBody, paths, today);
  let r = await callText({ provider: st.provider, model: st.model, system, user });
  const u0 = normalise(st.provider, r.usage); const tok = { ...u0 };
  let cost = await record({ plan_id: row.id, lang, kind: 'text', provider: st.provider, model: st.model, usage: u0 });
  const enFm = enBody ? frontMatter(enBody)[0] : null;
  let fin = finish(stripFences(r.text), row, lang, paths, enFm);
  let text = fin.text;
  let { problems, words } = validate(text, row, lang, paths);
  if (r.truncated) problems.push('output cut at the token ceiling');
  // Only a genuinely short or truncated draft is worth a second call; everything else is accepted with a warning.
  const worth = (ps) => ps.some((p) => /^length \d+ vs/.test(p) || /cut at the token/.test(p) || /no front matter/.test(p));
  for (let attempt = 0; attempt < Number(st.max_retries ?? 1) && problems.length && worth(problems); attempt++) {
    r = await callText({ provider: st.provider, model: st.model, system, user: expandUser(lang, text, problems, Number(row.length || 900)) });
    const u1 = normalise(st.provider, r.usage); for (const k of Object.keys(u1)) tok[k] = (tok[k] || 0) + u1[k];
    cost += await record({ plan_id: row.id, lang, kind: 'text', provider: st.provider, model: st.model, usage: u1 });
    const nf = finish(stripFences(r.text), row, lang, paths, enFm);
    const v = validate(nf.text, row, lang, paths);
    if (v.words >= words || !v.problems.length) { text = nf.text; fin = nf; ({ problems, words } = v); }
  }
  if (fin.fixed?.length) problems = problems.filter((p) => !/translationKey|missing front matter: (type|image|categories)/.test(p));
  const slug = lang === 'en' ? row.slug_en : row.slug_fr;
  await db.from('articles').upsert({ plan_id: row.id, lang, slug, body: text, words, warnings: problems.join('; '), edited: false, updated_at: new Date().toISOString() });
  await db.from('plan').update({ [`status_${lang}`]: problems.length ? 'check' : 'written' }).eq('id', row.id);
  const k = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n || 0));
  await log(`${row.id} ${lang.toUpperCase()}: ${words} words · $${cost.toFixed(3)} · in ${k(tok.input)} · cached ${k(tok.cache_read)} · written-to-cache ${k(tok.cache_write)} · out ${k(tok.output)}${problems.length ? ' ⚠ ' + problems.join('; ') : ''}`);
  return text;
}

export async function POST(req) {
  if (!(await isAuthed())) return unauthorized();
  const { ids, en, fr, force } = await req.json();
  const st = await settings();
  const cap = await overCap(); if (cap) return Response.json({ error: `Daily cap of $${cap} reached. Raise it in Settings to continue.` }, { status: 429 });
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

import { db, log, settings, doc } from '@/lib/db';
import { isAuthed, unauthorized } from '@/lib/auth';
import { callText } from '@/lib/providers';
import { record, normalise } from '@/lib/cost';

export const maxDuration = 300;
const slugify = (s) => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);

/* Fills the missing language for up to 40 rows per call; the client loops until nothing is missing. */
export async function POST() {
  if (!(await isAuthed())) return unauthorized();
  const st = await settings();
  const { data: all } = await db.from('plan').select('*').in('type', ['article', 'pillar']).neq('status_en', 'merged');
  const missing = (all || []).filter((r) => (r.origin === 'en' && !r.title_fr) || (r.origin === 'fr' && !r.title_en)).slice(0, 40);
  if (!missing.length) return Response.json({ ok: true, remaining: 0 });
  const prompt = await doc('prepare_titles') || 'For each row, propose the missing counterpart in the other language: an SEO title (keyword first, natural, 55–70 characters), a target keyword (2–5 words people type), a URL slug (lowercase, hyphens, ASCII, 3–6 words). French titles must be genuinely French, not literal translations. Return ONLY a JSON array: [{"id":"...","title":"...","keyword":"...","slug":"..."}]';
  const lines = missing.map((r) => r.origin === 'en'
    ? `id=${r.id} | need: FRENCH | english title: ${r.title_en} | keyword: ${r.keyword_en} | category: ${r.category}`
    : `id=${r.id} | need: ENGLISH | french title: ${r.title_fr} | keyword: ${r.keyword_fr} | category: ${r.category}`);
  const cheap = st.cheap_model && st.cheap_model !== 'none' ? st.cheap_model : st.model; const prov = cheap.startsWith('claude') ? 'anthropic' : cheap.startsWith('gpt') ? 'openai' : cheap.startsWith('gemini') ? 'google' : st.provider;
  const r = await callText({ provider: prov, model: cheap, system: [{ type: 'text', text: prompt }], user: lines.join('\n'), maxTokens: 8000 });
  await record({ kind: 'prepare', provider: prov, model: cheap, usage: normalise(prov, r.usage) });
  const m = /\[[\s\S]*\]/.exec(r.text);
  const items = m ? JSON.parse(m[0]) : [];
  const used = new Set((all || []).flatMap((x) => [x.path_en, x.path_fr]).filter(Boolean));
  let n = 0;
  for (const it of items) {
    const row = missing.find((x) => String(x.id) === String(it.id)); if (!row) continue;
    let s = slugify(it.slug || it.title);
    if (row.origin === 'en') { let p = `/fr/blog/${s}/`; while (used.has(p)) { s += '-2'; p = `/fr/blog/${s}/`; } used.add(p);
      await db.from('plan').update({ title_fr: it.title, keyword_fr: it.keyword, slug_fr: s, path_fr: p }).eq('id', row.id); }
    else { let p = `/blog/${s}/`; while (used.has(p)) { s += '-2'; p = `/blog/${s}/`; } used.add(p);
      await db.from('plan').update({ title_en: it.title, keyword_en: it.keyword, slug_en: s, path_en: p }).eq('id', row.id); }
    n++;
  }
  const remaining = (all || []).filter((r) => (r.origin === 'en' && !r.title_fr) || (r.origin === 'fr' && !r.title_en)).length - n;
  await log(`prepare: ${n} title(s) filled, ${Math.max(0, remaining)} remaining`);
  return Response.json({ ok: true, filled: n, remaining: Math.max(0, remaining) });
}

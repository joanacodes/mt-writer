/* One-off: loads plan.csv, the prompts, the brand book, the facts, the examples and the site path map into Supabase.
   Usage:  node scripts/import-plan.mjs ../mt-writer ../mt
   (first argument: the local writer folder; second: the Hugo site, for the already-written articles) */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SRC = process.argv[2] || '../mt-writer';
const SITE = process.argv[3] || '../mt';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

function parseCSV(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');

// 1. plan
const rows = parseCSV(read(path.join(SRC, 'data/plan.csv')));
console.log('plan rows:', rows.length);
const planRows = rows.map((r, i) => ({
  id: r.id, origin: r.origin, type: r.type, category: r.category, tags: r.tags,
  title_en: r.title_en, title_fr: r.title_fr, keyword_en: r.keyword_en, keyword_fr: r.keyword_fr,
  slug_en: r.slug_en, path_en: r.path_en, slug_fr: r.slug_fr, path_fr: r.path_fr,
  length: parseInt(r.length) || 900, angle: r.angle, notes: r.notes || '', pair_of: r.pair_of,
  status_en: r.status_en === 'exists' ? 'exists' : r.status_en || 'todo', status_fr: r.status_fr || 'todo',
  merged_into: r.merged_into, cover: r.cover || '', sort: i,
}));
for (let i = 0; i < planRows.length; i += 200) {
  const { error } = await db.from('plan').upsert(planRows.slice(i, i + 200));
  if (error) { console.error(error); process.exit(1); }
}
console.log('plan imported');

// 2. docs
const docs = {
  style: read(path.join(SRC, 'prompts/style.md')),
  system_en: read(path.join(SRC, 'prompts/system_en.md')),
  system_fr: read(path.join(SRC, 'prompts/system_fr.md')),
  image_style: read(path.join(SRC, 'prompts/image_style.md')),
  prepare_titles: read(path.join(SRC, 'prompts/prepare_titles.md')),
  facts: read(path.join(SRC, 'notes/facts.md')),
  'brand-book': read(path.join(SRC, 'notes/brand-book.md')),
  example_en_1: read(path.join(SRC, 'notes/example_en_1.md')),
  example_en_2: read(path.join(SRC, 'notes/example_en_2.md')),
  example_fr_1: read(path.join(SRC, 'notes/example_fr_1.md')),
  example_fr_2: read(path.join(SRC, 'notes/example_fr_2.md')),
  site_paths: read(path.join(SRC, 'data/site_paths.json')),
};
const ref = path.join(SRC, 'notes/reference.jpg');
if (fs.existsSync(ref)) docs.reference_jpg_base64 = fs.readFileSync(ref).toString('base64');
for (const [name, content] of Object.entries(docs)) {
  if (!content) { console.log('missing (skipped):', name); continue; }
  await db.from('docs').upsert({ name, content, updated_at: new Date().toISOString() });
}
console.log('docs imported:', Object.keys(docs).length);

// 3. articles already written on the site
let n = 0;
for (const r of planRows) {
  for (const [lang, slug] of [['en', r.slug_en], ['fr', r.slug_fr]]) {
    if (!slug) continue;
    const f = path.join(SITE, 'content', lang, 'blog', slug + '.md');
    if (!fs.existsSync(f)) continue;
    const body = fs.readFileSync(f, 'utf8');
    await db.from('articles').upsert({ plan_id: r.id, lang, slug, body, words: (body.match(/\w+/g) || []).length, warnings: '', edited: true, published_at: new Date().toISOString() });
    await db.from('plan').update({ ['status_' + lang]: 'written' }).eq('id', r.id);
    n++;
  }
}
console.log('existing articles imported:', n);
console.log('done.');

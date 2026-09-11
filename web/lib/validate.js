import { frontMatter } from './prompt';

const BANNED = [/\bmanifest(ing|ation)?\b(?! culture)/i, /\bvibes?\b/i, /\bdivine\b/i, /\bsacred\b/i, /\bblessed\b/i];

export function validate(text, row, lang, paths) {
  const problems = [];
  const [fm, body] = frontMatter(text);
  if (!fm) return { problems: ['no front matter'], words: 0 };
  for (const k of ['title', 'description', 'translationKey', 'type', 'date', 'categories', 'tags', 'summary', 'image', 'imageAlt', 'imagePrompt'])
    if (!(k in fm)) problems.push('missing front matter: ' + k);
  if (fm.translationKey !== `post-${row.slug_en}`) problems.push('translationKey mismatch');
  const d = String(fm.description || '');
  if (d.length < 110 || d.length > 175) problems.push(`description length ${d.length}`);
  const words = (body.match(/\w+/g) || []).length;
  const target = Number(row.length || 900);
  if (words < target * 0.75 || words > target * 1.35) problems.push(`length ${words} vs ${target}`);
  const allowed = lang === 'en' ? paths.en : paths.fr;
  for (const [, p] of body.matchAll(/\]\((\/[^)#\s]*)(?:#[^)]*)?\)/g)) if (!allowed.has(p)) problems.push('link not allowed: ' + p);
  const nLinks = [...body.matchAll(/\]\(\//g)].length;
  if (nLinks < 2) problems.push(`only ${nLinks} internal link(s)`);
  for (const re of BANNED) if (re.test(body)) problems.push('banned word: ' + re.source);
  if (lang === 'fr' && /lentille/i.test(body)) problems.push("'lentille' used");
  if (/\bthe House\b/.test(body)) problems.push("'the House' used — say Maison Tarot");
  if (lang === 'en' && /\bthe host\b/i.test(body)) problems.push("'the host' used — say I");
  if (!/\b300\b/.test(row.title_en || '') && !/is tarot real|300/i.test(row.keyword_en || '') && /\b300\b/.test(body)) problems.push("'300' outside its subject");
  return { problems, words };
}

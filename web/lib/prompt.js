import { db, doc } from './db';

export function frontMatter(text) {
  const m = /^\s*---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (!m) return [null, text];
  const fm = {};
  let key = null;
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (kv) {
      key = kv[1]; const raw = kv[2].trim();
      if (/^\[.*\]$/.test(raw)) { try { fm[key] = JSON.parse(raw.replace(/'/g, '"')); } catch { fm[key] = raw.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean); } }
      else fm[key] = raw.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1').replace(/\\"/g, '"');
    }
    else if (key && /^\s*-\s+/.test(line)) { fm[key] = Array.isArray(fm[key]) ? fm[key] : []; fm[key].push(line.replace(/^\s*-\s+/, '').replace(/^"(.*)"$/, '$1')); }
  }
  return [fm, m[2]];
}
/* Drops code fences and anything the model wrote before the front matter. */
export const stripFences = (t) => {
  let s = String(t).replace(/```[a-z]*\r?\n?/g, '').trim();
  const i = s.search(/(^|\n)---\r?\n/);
  if (i > 0) s = s.slice(i).replace(/^\n/, '');
  return s.trim();
};

const CAT_FR = { Learn: 'Apprendre', Practice: 'Tirages', 'Ideas we refuse': 'Idées reçues', Trends: 'Tendances', 'Astrology, tested': 'Astrologie testée', 'Lenses & adjacent': 'Clés de lecture', Seasonal: 'Saisonnier', 'For readers': 'Pour les tarologues', 'Card meanings': 'Signification des lames', 'Stories & experience': 'Récits', Method: 'Méthode', Local: 'Villes' };

async function context(lang) {
  const [style, facts, brand, image, e1] = await Promise.all([
    doc('style'), doc('facts'), doc('brand-book'), doc('image_style'), doc(`example_${lang}_1`),
  ]);
  // the brand book's first sections (identity, voices, personality, voice rules, vocabulary) are what the writer needs; the rest is for humans
  const brandCut = brand.split(/\n## 7\. /)[0].slice(0, 14000);
  return `<style_guide>\n${style}\n</style_guide>\n\n<facts>\n${facts}\n</facts>\n\n<brand_book>\n${brandCut}\n</brand_book>\n\n<image_style>\n${image}\n</image_style>\n\n<example>\n${e1}\n</example>`;
}

export async function allowedPaths() {
  const sp = JSON.parse((await doc('site_paths')) || '{"paths":[],"en2fr":{},"fr2en":{}}');
  const { data } = await db.from('plan').select('path_en,path_fr,title_en,title_fr');
  const titles = {};
  const en = new Set(sp.paths.filter((p) => !p.startsWith('/fr/')));
  const fr = new Set(sp.paths.filter((p) => p.startsWith('/fr/')));
  const en2fr = { ...sp.en2fr };
  for (const r of data || []) {
    if (r.path_en) { en.add(r.path_en); titles[r.path_en] = r.title_en || r.title_fr || ''; }
    if (r.path_fr) { fr.add(r.path_fr); titles[r.path_fr] = r.title_fr || r.title_en || ''; }
    if (r.path_en && r.path_fr) en2fr[r.path_en] = r.path_fr;
  }
  return { en, fr, en2fr, titles };
}
const CITY = /^\/(fr\/)?(usa|canada|uk|australia|france|quebec|belgique|suisse|luxembourg|monaco)\/tarot-/;
const pathText = (set) => [...set].filter((p) => !CITY.test(p)).sort().join('\n');

export async function systemFor(lang, paths) {
  const sys = await doc(lang === 'en' ? 'system_en' : 'system_fr');
  return [
    { type: 'text', text: sys + '\n\n' + (await context(lang)), cache_control: { type: 'ephemeral' } },
    { type: 'text', text: '<allowed_paths>\n' + pathText(lang === 'en' ? paths.en : paths.fr) + '\n</allowed_paths>', cache_control: { type: 'ephemeral' } },
  ];
}

export function userEn(row, today) {
  return `Write this article.

id: ${row.id}
title (use as the front-matter title, you may tighten it slightly): ${row.title_en}
target keyword: ${row.keyword_en}
category: ${row.category}
suggested tags: ${row.tags}
length: the BODY (after the front matter) must be between ${Math.round((row.length || 900) * 0.9)} and ${Math.round((row.length || 900) * 1.25)} words — aim for ${row.length || 900}. Five to seven H2 sections of 120–200 words each gets you there. Short is a failure.
slug: ${row.slug_en}  (front matter must include: translationKey: post-${row.slug_en})
house angle: ${row.angle || ''}
notes (highest priority — follow them): ${row.notes || '(none)'}
date: ${today}

Set image: "covers/${row.slug_en}.jpg" in the front matter, and add an imagePrompt field built exactly as <image_style> describes.

Reminder: link only to paths in <allowed_paths>; never invent personal facts beyond <facts>; the '300 readings' count only where the count is the subject; never write "the House" or "the host".`;
}

export function userFr(row, enText, paths, today) {
  const links = [...enText.matchAll(/\]\((\/[^)#\s]*)(#[^)]*)?\)/g)].map(([, p, a]) => (paths.en2fr[p] ? `${p}${a || ''} -> ${paths.en2fr[p]}${a || ''}` : `${p}${a || ''} -> (pas de page française ; supprimez le lien, gardez la phrase)`));
  return `Écrivez la version française de cet article.

id : ${row.id}
titre français (à utiliser comme title, vous pouvez le resserrer) : ${row.title_fr || '(proposez-le, mot-clé en tête)'}
mot-clé cible : ${row.keyword_fr || '(déduisez-le)'}
catégorie (à écrire exactement ainsi dans categories) : ${CAT_FR[row.category] || row.category}
tags : en français, 5 à 7, pas une traduction mot à mot
longueur : le CORPS (après le front matter) doit faire entre ${Math.round((row.length || 900) * 0.9)} et ${Math.round((row.length || 900) * 1.25)} mots — visez ${row.length || 900}. Cinq à sept sections H2 de 120 à 200 mots. Trop court = raté.
Commencez la sortie DIRECTEMENT par la ligne --- du front matter. Rien avant.
slug : ${row.slug_fr}  (le front matter doit contenir : translationKey: post-${row.slug_en})
notes (priorité absolue) : ${row.notes || '(aucune)'}
date : ${today}
image : "covers/${row.slug_en}.jpg" ; recopiez le champ imagePrompt de l'article anglais tel quel.

Correspondance des liens (anglais -> français) :
${links.join('\n') || '(aucun lien)'}

<article_anglais>
${enText}
</article_anglais>`;
}

/* Second attempt: expand the model's own draft rather than start again. */
export function expandUser(lang, draft, problems, target) {
  return lang === 'en'
    ? `Your draft below has problems: ${problems.join('; ')}. Fix them and return the COMPLETE article again — front matter first, starting with the --- line, nothing before it. If it is too short, expand every section with a concrete example or a second angle until the body has at least ${Math.round(target * 0.9)} words (aim for ${target}); do not pad with repetition. Keep everything else that was right.\n\n<draft>\n${draft}\n</draft>`
    : `Votre brouillon ci-dessous a des problèmes : ${problems.join(' ; ')}. Corrigez-les et renvoyez l'article COMPLET — front matter d'abord, en commençant par la ligne ---, rien avant. S'il est trop court, développez chaque section avec un exemple concret ou un second angle jusqu'à ce que le corps fasse au moins ${Math.round(target * 0.9)} mots (visez ${target}) ; pas de remplissage. Gardez ce qui était juste.\n\n<brouillon>\n${draft}\n</brouillon>`;
}

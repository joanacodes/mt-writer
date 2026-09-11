/* Deterministic post-processing: the fields the app controls are set by the app, not by the model.
   This removes the most common "retry" causes (translationKey, image, type, date, category) for free. */
import { frontMatter } from './prompt';

const CAT_FR = { Learn: 'Apprendre', Practice: 'Tirages', 'Ideas we refuse': 'Idées reçues', Trends: 'Tendances', 'Astrology, tested': 'Astrologie testée', 'Lenses & adjacent': 'Clés de lecture', Seasonal: 'Saisonnier', 'For readers': 'Pour les tarologues', 'Card meanings': 'Signification des lames', 'Stories & experience': 'Récits', Method: 'Méthode', Local: 'Villes' };
const q = (s) => '"' + String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ') + '"';
const list = (a) => '[' + (Array.isArray(a) ? a : String(a || '').split(',').map((x) => x.trim()).filter(Boolean)).map(q).join(', ') + ']';

export function finish(text, row, lang, paths, enFm) {
  let [fm, body] = frontMatter(text);
  if (!fm) return { text, fixed: ['no front matter'] };
  const fixed = [];
  const set = (k, v) => { if (fm[k] !== v) { fm[k] = v; fixed.push(k); } };
  set('translationKey', `post-${row.slug_en}`);
  set('type', 'blog');
  set('image', `covers/${row.slug_en}.jpg`);
  if (!fm.date) set('date', new Date().toISOString().slice(0, 10));
  const cat = lang === 'en' ? row.category : (CAT_FR[row.category] || row.category);
  set('categories', [cat]);
  if (lang === 'fr' && enFm?.imagePrompt && fm.imagePrompt !== enFm.imagePrompt) set('imagePrompt', enFm.imagePrompt);
  if (!fm.tags || (Array.isArray(fm.tags) && fm.tags.length < 3)) set('tags', String(row.tags || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 7));
  // links to pages that don't exist: unlink, keep the words
  const allowed = lang === 'en' ? paths.en : paths.fr;
  let unlinked = 0;
  body = body.replace(/\[([^\]]+)\]\((\/[^)#\s]*)(#[^)]*)?\)/g, (m, txt, p, a) => (allowed.has(p) ? m : (unlinked++, txt)));
  if (unlinked) fixed.push(`${unlinked} link(s) unlinked`);
  // rebuild front matter in a fixed order
  const order = ['title', 'description', 'translationKey', 'type', 'date', 'categories', 'tags', 'featured', 'image', 'imageAlt', 'imagePrompt', 'summary'];
  const keys = [...order.filter((k) => k in fm), ...Object.keys(fm).filter((k) => !order.includes(k))];
  const lines = keys.map((k) => (k === 'categories' || k === 'tags') ? `${k}: ${list(fm[k])}` : k === 'featured' ? `${k}: ${fm[k] === true || fm[k] === 'true'}` : k === 'date' ? `${k}: ${fm[k]}` : `${k}: ${q(fm[k])}`);
  return { text: `---\n${lines.join('\n')}\n---\n${body.trim()}\n`, fixed, fm };
}

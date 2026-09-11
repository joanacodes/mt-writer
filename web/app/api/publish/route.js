import { db, log } from '@/lib/db';
import { isAuthed, unauthorized } from '@/lib/auth';
import { putFile, b64, safeSlug } from '@/lib/github';
import { settings } from '@/lib/db';

export const maxDuration = 300;

/* Commits the selected articles (and their covers) to the Hugo repo. GitHub Actions rebuilds the site. */
export async function POST(req) {
  if (!(await isAuthed())) return unauthorized();
  const { ids } = await req.json();
  const st = await settings();
  const published = [];
  for (const id of ids) {
    const { data: row } = await db.from('plan').select('*').eq('id', id).maybeSingle();
    if (!row) continue;
    const { data: arts } = await db.from('articles').select('*').eq('plan_id', id);
    const { data: cover } = await db.from('covers').select('*').eq('plan_id', id).maybeSingle();
    try {
      for (const a of arts || []) {
        const slug = safeSlug(a.slug); if (!slug) continue;
        const path = a.lang === 'en' ? `content/en/blog/${slug}.md` : `content/fr/blog/${slug}.md`;
        await putFile(path, b64(a.body), `${st.publish_prefix || 'Article'}: ${row.title_en || row.title_fr} (${a.lang})`);
        await db.from('articles').update({ published_at: new Date().toISOString() }).eq('plan_id', id).eq('lang', a.lang);
      }
      if (cover?.data && (st.publish_covers ?? '1') !== '0') {
        await putFile(`assets/covers/${safeSlug(cover.slug)}.jpg`, cover.data, `Cover: ${safeSlug(cover.slug)}`);
        await db.from('covers').update({ published_at: new Date().toISOString() }).eq('plan_id', id);
      }
      await log(`${id}: published to GitHub`);
      published.push(id);
    } catch (e) { await log(`${id}: publish ERROR ${e.message}`); }
  }
  return Response.json({ ok: true, published });
}

import { settings } from '@/lib/db';
import { isAuthed, unauthorized } from '@/lib/auth';
import { submitBatchFor } from '@/lib/batch';

export const maxDuration = 120;

/* mode 'en' | 'fr'; chain: what happens automatically when the batch lands ('fr', 'fr+covers', 'covers'). */
export async function POST(req) {
  if (!(await isAuthed())) return unauthorized();
  const { ids, mode = 'en', chain = '' } = await req.json();
  const st = await settings();
  if (st.provider !== 'anthropic') return Response.json({ error: 'Batch mode uses the Anthropic API. Switch the model, or use the live buttons.' }, { status: 400 });
  const r = await submitBatchFor({ ids, mode, model: st.model, chain });
  if (!r) return Response.json({ error: mode === 'fr' ? 'No English article yet for these rows.' : 'Nothing to submit.' }, { status: 400 });
  return Response.json({ ok: true, ...r });
}

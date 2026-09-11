import { settings } from '@/lib/db';
import { isAuthed, unauthorized } from '@/lib/auth';
import { submitBatchFor } from '@/lib/batch';
import { overCap } from '@/lib/cost';

export const maxDuration = 120;

/* mode 'en' | 'fr'; chain: what happens automatically when the batch lands ('fr', 'fr+covers', 'covers'). */
export async function POST(req) {
  if (!(await isAuthed())) return unauthorized();
  const { ids, mode = 'en', chain = '' } = await req.json();
  const st = await settings();
  const cap = await overCap(); if (cap) return Response.json({ error: `Daily cap of $${cap} reached. Raise it in Settings to continue.` }, { status: 429 });
  if (st.provider !== 'anthropic') return Response.json({ error: 'Batch mode uses the Anthropic API. Switch the model, or use the live buttons.' }, { status: 400 });
  const resolved = chain === 'auto' ? ((st.overnight_fr ?? '1') !== '0' ? 'fr' : '') + ((st.overnight_covers ?? '0') === '1' ? ((st.overnight_fr ?? '1') !== '0' ? '+covers' : 'covers') : '') : chain;
  const r = await submitBatchFor({ ids, mode, model: st.model, chain: resolved });
  if (!r) return Response.json({ error: mode === 'fr' ? 'No English article yet for these rows.' : 'Nothing to submit.' }, { status: 400 });
  return Response.json({ ok: true, ...r });
}

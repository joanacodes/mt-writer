import { db, log } from '@/lib/db';
import { isAuthed, unauthorized } from '@/lib/auth';

/* Housekeeping actions from the settings panel. */
export async function POST(req) {
  if (!(await isAuthed())) return unauthorized();
  const { action } = await req.json();
  if (action === 'clear_logs') { await db.from('logs').delete().gt('id', 0); return Response.json({ ok: true }); }
  if (action === 'reset_queued') { await db.from('plan').update({ status_en: 'todo' }).eq('status_en', 'queued'); await db.from('plan').update({ status_fr: 'todo' }).eq('status_fr', 'queued'); await db.from('jobs').update({ status: 'abandoned' }).in('status', ['submitted', 'in_progress']); await log('queued rows reset to todo; open batches abandoned'); return Response.json({ ok: true }); }
  if (action === 'clear_cover_queue') { await db.from('queue').delete().neq('status', 'done'); return Response.json({ ok: true }); }
  return Response.json({ error: 'unknown action' }, { status: 400 });
}

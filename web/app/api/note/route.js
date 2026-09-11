import { db } from '@/lib/db';
import { isAuthed, unauthorized } from '@/lib/auth';

export async function POST(req) {
  if (!(await isAuthed())) return unauthorized();
  const { id, notes } = await req.json();
  await db.from('plan').update({ notes, updated_at: new Date().toISOString() }).eq('id', id);
  return Response.json({ ok: true });
}

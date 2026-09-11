import { db } from '@/lib/db';
import { isAuthed, unauthorized } from '@/lib/auth';

/* Reference photo for cover generation: stored as base64 in docs.reference_jpg_base64 */
export async function POST(req) {
  if (!(await isAuthed())) return unauthorized();
  const { data } = await req.json();
  if (!data) { await db.from('docs').delete().eq('name', 'reference_jpg_base64'); return Response.json({ ok: true, removed: true }); }
  if (data.length > 4_000_000) return Response.json({ error: 'Image too large — keep it under 3 MB.' }, { status: 400 });
  await db.from('docs').upsert({ name: 'reference_jpg_base64', content: data, updated_at: new Date().toISOString() });
  return Response.json({ ok: true });
}
export async function GET() {
  if (!(await isAuthed())) return unauthorized();
  const { data } = await db.from('docs').select('updated_at').eq('name', 'reference_jpg_base64').maybeSingle();
  return Response.json({ present: !!data, updated_at: data?.updated_at || null });
}

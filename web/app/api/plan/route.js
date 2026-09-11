import { db } from '@/lib/db';
import { isAuthed, unauthorized } from '@/lib/auth';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAuthed())) return unauthorized();
  const { data, error } = await db.from('plan').select('*').order('sort', { ascending: true }).limit(2000);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

import { db } from '@/lib/db';
import { isAuthed, unauthorized } from '@/lib/auth';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAuthed())) return unauthorized();
  const [{ data: logs }, { data: jobs }] = await Promise.all([
    db.from('logs').select('*').order('id', { ascending: false }).limit(60),
    db.from('jobs').select('*').in('status', ['submitted', 'in_progress']).order('created_at', { ascending: false }),
  ]);
  return Response.json({ logs: logs || [], jobs: jobs || [] });
}

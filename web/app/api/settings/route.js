import { db, settings } from '@/lib/db';
import { isAuthed, unauthorized } from '@/lib/auth';
import { TEXT_MODELS, IMAGE_MODELS } from '@/lib/providers';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAuthed())) return unauthorized();
  return Response.json({ ...(await settings()), textModels: TEXT_MODELS, imageModels: IMAGE_MODELS });
}
export async function POST(req) {
  if (!(await isAuthed())) return unauthorized();
  const body = await req.json();
  for (const [key, value] of Object.entries(body)) await db.from('settings').upsert({ key, value: String(value) });
  return Response.json({ ok: true });
}

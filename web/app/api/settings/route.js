import { db, settings } from '@/lib/db';
import { isAuthed, unauthorized } from '@/lib/auth';
import { TEXT_MODELS, IMAGE_MODELS } from '@/lib/providers';
import { totals, averages } from '@/lib/cost';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAuthed())) return unauthorized();
  const DEFAULTS = { provider: 'anthropic', model: 'claude-fable-5-1', cheap_model: 'claude-haiku-4-5-20251001', image_provider: 'google', image_model: 'gemini-2.5-flash-image', overnight_fr: '1', overnight_covers: '0', max_retries: '1', chunk_live: '2', poll_seconds: '6', publish_prefix: 'Article', publish_covers: '1', default_length: '900', confirm_publish: '1', daily_cap_usd: '25' };
  return Response.json({ ...DEFAULTS, ...(await settings()), textModels: TEXT_MODELS, imageModels: IMAGE_MODELS, spend: await totals(), avg: await averages() });
}
export async function POST(req) {
  if (!(await isAuthed())) return unauthorized();
  const body = await req.json();
  for (const [key, value] of Object.entries(body)) await db.from('settings').upsert({ key, value: String(value) });
  return Response.json({ ok: true });
}

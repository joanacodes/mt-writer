import { db, doc } from './db';

let cache = null;
export async function prices() {
  if (!cache) { try { cache = JSON.parse(await doc('prices')); } catch { cache = {}; } }
  return cache;
}
export function priceOf(p, model, u, batch = false, image = false) {
  const t = p[model] || {};
  if (image) return t.image ?? 0.04;
  const m = 1e6, disc = batch ? (p._batch_discount ?? 0.5) : 1;
  return disc * (((u.input || 0) * (t.in || 0)) + ((u.output || 0) * (t.out || 0)) + ((u.cache_read || 0) * (t.cache_read || 0)) + ((u.cache_write || 0) * (t.cache_write || 0))) / m;
}
/** Normalise the usage object of each provider to {input, output, cache_read, cache_write}. */
export function normalise(provider, raw) {
  if (!raw) return {};
  if (provider === 'anthropic') return { input: raw.input_tokens || 0, output: raw.output_tokens || 0, cache_read: raw.cache_read_input_tokens || 0, cache_write: raw.cache_creation_input_tokens || 0 };
  if (provider === 'openai') return { input: raw.prompt_tokens || 0, output: raw.completion_tokens || 0 };
  if (provider === 'google') return { input: raw.promptTokenCount || 0, output: raw.candidatesTokenCount || 0 };
  return {};
}
export async function record({ plan_id = null, lang = null, kind, provider, model, usage = {}, batch = false, image = false }) {
  const p = await prices();
  const cost = priceOf(p, model, usage, batch, image);
  await db.from('usage').insert({ plan_id, lang, kind, provider, model, input: usage.input || 0, output: usage.output || 0, cache_read: usage.cache_read || 0, cache_write: usage.cache_write || 0, cost_usd: cost });
  return cost;
}
export async function totals() {
  const { data } = await db.from('usage').select('at,cost_usd,plan_id');
  const rows = data || [];
  const today = new Date().toISOString().slice(0, 10);
  const sum = (arr) => arr.reduce((a, r) => a + Number(r.cost_usd || 0), 0);
  return { today: sum(rows.filter((r) => String(r.at).slice(0, 10) === today)), total: sum(rows), calls: rows.length };
}
export async function articleCost(plan_id) {
  const { data } = await db.from('usage').select('cost_usd').eq('plan_id', plan_id);
  return (data || []).reduce((a, r) => a + Number(r.cost_usd || 0), 0);
}

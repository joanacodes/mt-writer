/* Text and image model calls, by fetch — no SDKs. */

export const TEXT_MODELS = {
  anthropic: ['claude-fable-5-1', 'claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'],
  openai: ['gpt-5.6-sol', 'gpt-5.6-mini', 'gpt-5.5'],
  google: ['gemini-3-pro', 'gemini-3-flash'],
};
export const IMAGE_MODELS = {
  google: ['gemini-2.5-flash-image'],
  openai: ['gpt-image-1'],
};

const A_VERSION = '2023-06-01';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/* Retries on overload (529), rate limit (429) and server errors, with growing pauses. */
async function withRetry(fn, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      const retryable = /overloaded|rate.?limit|529|429|5\d\d|ECONNRESET|fetch failed/i.test(e.message || '');
      if (!retryable || i === tries - 1) throw e;
      await sleep([3000, 8000, 20000][i] || 20000);
    }
  }
  throw last;
}

/* Writing needs no extended thinking: it burns the priciest tokens and eats the output ceiling. */
export function anthropicParams({ model, system, user, maxTokens }) {
  return { model, max_tokens: maxTokens, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content: user }] };
}

export async function callText({ provider, model, system, user, maxTokens = 16000 }) {
  if (provider === 'anthropic') {
    return withRetry(async () => {
      let params = anthropicParams({ model, system, user, maxTokens });
      let r = await fetch(`${process.env.MT_TEST_BASE || 'https://api.anthropic.com'}/v1/messages`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': A_VERSION }, body: JSON.stringify(params),
      });
      let j = await r.json();
      if (!r.ok && /thinking/i.test(j.error?.message || '')) {           // model doesn't take the flag: send without it
        delete params.thinking;
        r = await fetch(`${process.env.MT_TEST_BASE || 'https://api.anthropic.com'}/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': A_VERSION }, body: JSON.stringify(params) });
        j = await r.json();
      }
      if (!r.ok) throw new Error((j.error?.message || JSON.stringify(j).slice(0, 300)) + ` (${r.status})`);
      return { text: j.content.filter((b) => b.type === 'text').map((b) => b.text).join(''), usage: j.usage, truncated: j.stop_reason === 'max_tokens' };
    });
  }
  const sysText = Array.isArray(system) ? system.map((b) => b.text).join('\n\n') : system;
  if (provider === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: sysText }, { role: 'user', content: user }], max_completion_tokens: maxTokens }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || 'openai error');
    return { text: j.choices[0].message.content, usage: j.usage };
  }
  if (provider === 'google') {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const r = await fetch(`${process.env.MT_TEST_GOOGLE || 'https://generativelanguage.googleapis.com'}/v1beta/models/${model}:generateContent?key=${key}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: sysText }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { maxOutputTokens: maxTokens } }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || 'google error');
    return { text: (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join(''), usage: j.usageMetadata };
  }
  throw new Error('unknown provider ' + provider);
}

/* ——— Anthropic Message Batches: submit many, poll later, half price ——— */
export async function submitBatch(requests) {
  const r = await fetch(`${process.env.MT_TEST_BASE || 'https://api.anthropic.com'}/v1/messages/batches`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': A_VERSION },
    body: JSON.stringify({ requests }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || JSON.stringify(j).slice(0, 300));
  return j;
}
export async function batchStatus(id) {
  const r = await fetch(`${process.env.MT_TEST_BASE || 'https://api.anthropic.com'}/v1/messages/batches/${id}`, {
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': A_VERSION },
  });
  return r.json();
}
export async function batchResults(url) {
  const r = await fetch(url, { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': A_VERSION } });
  const text = await r.text();
  return text.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

/* ——— images ——— */
export async function callImage({ provider, model, prompt, referenceB64 }) {
  if (provider === 'google') {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const parts = [];
    if (referenceB64) {
      parts.push({ inline_data: { mime_type: 'image/jpeg', data: referenceB64 } });
      prompt = 'Match the photographic style, lighting and tonality of the attached reference photo exactly. ' + prompt;
    }
    parts.push({ text: prompt });
    const r = await fetch(`${process.env.MT_TEST_GOOGLE || 'https://generativelanguage.googleapis.com'}/v1beta/models/${model}:generateContent?key=${key}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || 'google image error');
    for (const c of j.candidates || []) for (const p of c.content?.parts || []) if (p.inlineData?.data || p.inline_data?.data) return p.inlineData?.data || p.inline_data.data;
    throw new Error('no image returned');
  }
  if (provider === 'openai') {
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model, prompt, size: '1536x1024', quality: 'medium', n: 1 }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || 'openai image error');
    return j.data[0].b64_json;
  }
  throw new Error('unknown image provider ' + provider);
}

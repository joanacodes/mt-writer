const API = 'https://api.github.com';
const owner = () => process.env.GITHUB_OWNER;
const repo = () => process.env.GITHUB_REPO;
const branch = () => process.env.GITHUB_BRANCH || 'main';
const headers = () => ({ authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' });

async function sha(path) {
  const r = await fetch(`${API}/repos/${owner()}/${repo()}/contents/${encodeURI(path)}?ref=${branch()}`, { headers: headers() });
  if (r.status === 404) return null;
  const j = await r.json();
  return j.sha || null;
}

export async function putFile(path, contentB64, message) {
  const existing = await sha(path);
  const r = await fetch(`${API}/repos/${owner()}/${repo()}/contents/${encodeURI(path)}`, {
    method: 'PUT', headers: headers(),
    body: JSON.stringify({ message, content: contentB64, branch: branch(), ...(existing ? { sha: existing } : {}) }),
  });
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
export const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
export const safeSlug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80);

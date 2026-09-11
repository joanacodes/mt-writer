'use client';
/* A small, safe Markdown renderer for reading articles: front matter box, headings, paragraphs, lists, quotes, bold/italic, links. */
import { frontMatter } from '@/lib/prompt';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\*)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\{\{&lt; todo &gt;\}\}(.*?)\{\{&lt; \/todo &gt;\}\}/g, '<mark style="background:var(--gold-soft);color:var(--gold)">¶ $1</mark>');
}
export function render(text) {
  const [fm, body] = frontMatter(text);
  let html = '';
  if (fm) html += `<div class="fm">${Object.entries(fm).map(([k, v]) => `<b>${esc(k)}</b>: ${esc(Array.isArray(v) ? v.join(', ') : String(v))}`).join('\n')}</div>`;
  const lines = (fm ? body : text).split('\n');
  let para = [], list = null;
  const flush = () => { if (para.length) { html += `<p>${inline(para.join(' '))}</p>`; para = []; } if (list) { html += `<${list.t}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.t}>`; list = null; } };
  for (const raw of lines) {
    const l = raw.trimEnd();
    if (!l.trim()) { flush(); continue; }
    const h = /^(#{1,3})\s+(.*?)(\s*\{#[^}]*\})?$/.exec(l);
    if (h) { flush(); html += `<h${h[1].length + 0}>${inline(h[2])}</h${h[1].length + 0}>`; continue; }
    const ol = /^\d+\.\s+(.*)/.exec(l), ul = /^[-*]\s+(.*)/.exec(l);
    if (ol || ul) { const t = ol ? 'ol' : 'ul'; if (!list || list.t !== t) { flush(); list = { t, items: [] }; } list.items.push((ol || ul)[1]); continue; }
    if (l.startsWith('>')) { flush(); html += `<blockquote>${inline(l.replace(/^>\s?/, ''))}</blockquote>`; continue; }
    para.push(l);
  }
  flush();
  return html;
}
export default function Md({ text }) {
  return <div className="prose" dangerouslySetInnerHTML={{ __html: render(text || '') }} />;
}

'use client';
import { useEffect, useState, useCallback } from 'react';
import Md from './md';
import { toast } from './Toasts';

const j = (url, body, method = 'POST') => fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());

export default function Detail({ row, close, onChange, inline }) {
  const [data, setData] = useState(null);
  const [lang, setLang] = useState('en');
  const [mode, setMode] = useState('read'); // read | raw
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState('');
  const [notes, setNotes] = useState(row.notes || '');

  const load = useCallback(() => fetch(`/api/article?id=${row.id}`).then((r) => r.json()).then(setData).catch(() => {}), [row.id]);
  useEffect(() => { setLang('en'); setMode('read'); setNotes(row.notes || ''); load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [row.id, load]);

  const art = (data?.articles || []).find((a) => a.lang === lang);
  const status = row[`status_${lang}`];

  async function saveNotes() { await j('/api/note', { id: row.id, notes }); onChange?.(); toast('Notes saved'); }
  async function regenerate(en, fr) {
    const what = en && fr ? 'both languages' : en ? 'the English' : 'the French';
    if (!confirm(`Rewrite ${what}? The current text will be replaced.`)) return;
    setBusy(en && fr ? 'both' : en ? 'en' : 'fr');
    const r = await j('/api/generate', { ids: [row.id], en, fr, force: true });
    if (r.error) toast(r.error, 'err'); else toast('Done');
    await load(); onChange?.(); setBusy('');
  }
  async function saveRaw() { await j('/api/article', { id: row.id, lang, body: draft }); await load(); setMode('read'); toast('Saved — this version is now protected from regeneration'); }
  async function publish() { if (!confirm('Publish this article (both languages and the cover) to the site?')) return; setBusy('pub'); const r = await j('/api/publish', { ids: [row.id] }); setBusy(''); toast(r.published?.length ? 'Published — the site is rebuilding' : 'Nothing published, see the log', r.published?.length ? '' : 'err'); await load(); }
  async function cover() { setBusy('cover'); const r = await j('/api/covers', { ids: [row.id] }); setBusy(''); toast(r.done?.length ? 'Cover generated' : 'No cover — see the log', r.done?.length ? '' : 'err'); await load(); }

  return (
    <div className={`sheet${inline ? ' inline' : ''} detail`}>
      <div className="head">
        {!inline && <button className="ghost" onClick={close}>← back</button>}
        <strong title={row.title_en}>{row.title_en || row.title_fr}</strong>
        <div className="tabs">
          <button className="chip" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
          <button className="chip" aria-pressed={lang === 'fr'} onClick={() => setLang('fr')}>Français</button>
          {art && <button className="chip" aria-pressed={mode === 'raw'} onClick={() => { if (mode === 'raw') setMode('read'); else { setDraft(art.body); setMode('raw'); } }}>{mode === 'raw' ? 'reading' : 'edit'}</button>}
          {mode === 'raw' && <button className="chip" onClick={saveRaw}>save</button>}
        </div>
      </div>
      <div className="body">
        <p className="mono" style={{ margin: '0 0 .3rem' }}>Notes for the writer — they outrank everything else in the prompt</p>
        <textarea className="notes" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} placeholder={row.angle || 'a story, a position, a correction…'} />

        <div className="tabs" style={{ margin: '1rem 0 .4rem' }}>
          <button className="chip" disabled={!!busy} title="Rewrite the English from scratch. The French is kept as it is." onClick={() => regenerate(true, false)}>{busy === 'en' ? 'writing EN…' : 'regenerate EN'}</button>
          <button className="chip" disabled={!!busy || !(data?.articles || []).some((a) => a.lang === 'en')} title="Rewrite the French from the current English." onClick={() => regenerate(false, true)}>{busy === 'fr' ? 'writing FR…' : 'regenerate FR'}</button>
          <button className="chip" disabled={!!busy} title="English first, then the French from the new English." onClick={() => regenerate(true, true)}>{busy === 'both' ? 'writing both…' : 'regenerate both'}</button>
          <button className="chip" disabled={!!busy || !(data?.articles || []).some((a) => a.lang === 'en')} title="Generate this article's cover image now." onClick={cover}>{busy === 'cover' ? 'drawing…' : data?.cover ? 'redo cover' : 'cover'}</button>
          <button className="chip" disabled={!!busy || !art} title="Commit both languages and the cover to the site repository." onClick={publish}>{busy === 'pub' ? 'publishing…' : 'publish'}</button>
        </div>

        <p className="status">
          {art ? `${art.words || 0} words · ${art.edited ? 'edited by hand · ' : ''}${art.published_at ? 'published ' + new Date(art.published_at).toLocaleDateString() + ' · ' : 'not published · '}` : ''}
          {data ? `cost so far $${Number(data.cost || 0).toFixed(2)}` : ''}{data?.cover ? ` · cover ${data.cover.published_at ? 'published' : 'ready'}` : ''}
        </p>
        {art?.warnings && <p className="warn">⚠ {art.warnings}</p>}
        {!art && <p className="empty">{status === 'queued' ? 'In a batch — this view refreshes itself when it lands.' : 'Not written yet. This view refreshes on its own.'}</p>}
        {art && mode === 'read' && <Md text={art.body} />}
        {art && mode === 'raw' && <textarea className="raw" value={draft} onChange={(e) => setDraft(e.target.value)} />}
      </div>
    </div>
  );
}

'use client';
import { useEffect, useMemo, useState, useCallback } from 'react';

const cls = (s) => (s === 'written' ? 'written' : s === 'check' ? 'check' : s === 'queued' ? 'queued' : '');

export default function Writer() {
  const [rows, setRows] = useState([]);
  const [sel, setSel] = useState(() => new Set());
  const [q, setQ] = useState(''); const [cat, setCat] = useState(''); const [st, setSt] = useState('');
  const [logs, setLogs] = useState([]); const [jobs, setJobs] = useState([]);
  const [busy, setBusy] = useState(''); const [open, setOpen] = useState(null);
  const [settings, setSettings] = useState(null);

  const loadPlan = useCallback(async () => setRows(await (await fetch('/api/plan')).json()), []);
  useEffect(() => { loadPlan(); fetch('/api/settings').then((r) => r.json()).then(setSettings); fetch('/api/cron'); }, [loadPlan]);
  useEffect(() => {
    const t = setInterval(async () => {
      const s = await (await fetch('/api/logs')).json();
      setLogs(s.logs); setJobs(s.jobs);
      if (s.jobs.length) { await fetch('/api/cron'); loadPlan(); }
    }, 6000);
    return () => clearInterval(t);
  }, [loadPlan]);

  const cats = useMemo(() => [...new Set(rows.map((r) => r.category))].sort(), [rows]);
  const shown = useMemo(() => rows.filter((r) => (r.type === 'article' || r.type === 'pillar') && r.status_en !== 'merged'
    && (!cat || r.category === cat)
    && (!q || `${r.title_en} ${r.title_fr}`.toLowerCase().includes(q.toLowerCase()))
    && (!st || (st === 'check' ? r.status_en === 'check' || r.status_fr === 'check'
      : st === 'written' ? r.status_en === 'written' && r.status_fr === 'written'
      : st === 'nocover' ? r.cover !== 'done'
      : r.status_en === 'todo' || r.status_fr === 'todo'))), [rows, q, cat, st]);

  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll = (on) => setSel((s) => { const n = new Set(s); shown.forEach((r) => (on ? n.add(r.id) : n.delete(r.id))); return n; });

  async function post(url, body, label) {
    if (!sel.size && url !== '/api/cron') return alert('Select at least one article.');
    setBusy(label);
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (j.error) alert(j.error);
    setBusy(''); loadPlan();
  }
  const ids = () => [...sel];

  return (
    <>
      <header className="top">
        <div className="bar">
          <span className="brand">MAISON TAROT</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="search" style={{ flex: 1 }} />
          <select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">all</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>
        </div>
        <div className="chips">
          {[['', 'any'], ['todo', 'to write'], ['written', 'done'], ['check', 'check ⚠'], ['nocover', 'no cover']].map(([v, l]) => (
            <button key={v} className="chip" aria-pressed={st === v} onClick={() => setSt(v)}>{l}</button>
          ))}
          <button className="chip" onClick={() => selectAll(true)}>select all ({shown.length})</button>
          <button className="chip" onClick={() => setSel(new Set())}>none</button>
          {settings && (
            <select className="chip" value={`${settings.provider}|${settings.model}`} onChange={async (e) => {
              const [provider, model] = e.target.value.split('|');
              setSettings({ ...settings, provider, model });
              await fetch('/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider, model }) });
            }}>
              {Object.entries(settings.textModels).flatMap(([p, ms]) => ms.map((m) => <option key={p + m} value={`${p}|${m}`}>{m}</option>))}
            </select>
          )}
        </div>
      </header>

      <div>
        {shown.map((r) => (
          <div className="row" key={r.id}>
            <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t" onClick={() => setOpen(r)}>{r.title_en || r.title_fr}</div>
              <div className="s">
                <span className={`dot ${cls(r.status_en)}`}><b />EN</span>
                <span className={`dot ${cls(r.status_fr)}`}><b />FR</span>
                <span className={`dot ${r.cover === 'done' ? 'written' : ''}`}><b />cover</span>
                <span>{r.category}</span><span>{r.length}w</span>
                <button className="chip" onClick={() => setOpen(r)}>open</button>
              </div>
              <textarea className="note" defaultValue={r.notes || ''} placeholder={r.angle || 'notes for the writer…'}
                onBlur={async (e) => { await fetch('/api/note', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: r.id, notes: e.target.value }) }); }} />
            </div>
          </div>
        ))}
      </div>

      <div className="log">
        {jobs.length ? `${jobs.length} batch job(s) running — results arrive on their own\n` : ''}
        {logs.map((l) => `${new Date(l.at).toLocaleTimeString()}  ${l.line}`).join('\n') || 'no activity yet'}
      </div>

      <div className="actions">
        <button className="solid" disabled={!!busy} onClick={() => post('/api/generate', { ids: ids(), en: true, fr: true }, 'both')}>{busy === 'both' ? '…' : `Write${sel.size ? ' ' + sel.size : ''}`}</button>
        <button disabled={!!busy} onClick={() => post('/api/generate', { ids: ids(), en: true, fr: false }, 'en')}>EN</button>
        <button disabled={!!busy} onClick={() => post('/api/generate', { ids: ids(), en: false, fr: true }, 'fr')}>FR</button>
        <button className="gold" disabled={!!busy} onClick={() => post('/api/batch', { ids: ids() }, 'batch')}>Batch ½</button>
        <button className="gold" disabled={!!busy} onClick={() => post('/api/covers', { ids: ids() }, 'covers')}>Covers</button>
        <button disabled={!!busy} onClick={() => { if (confirm(`Publish ${sel.size} article(s) to the site repo?`)) post('/api/publish', { ids: ids() }, 'publish'); }}>Publish</button>
      </div>

      {open && <Sheet row={open} close={() => { setOpen(null); loadPlan(); }} />}
    </>
  );
}

function Sheet({ row, close }) {
  const [data, setData] = useState(null); const [lang, setLang] = useState('en'); const [edit, setEdit] = useState(false); const [body, setBody] = useState('');
  useEffect(() => { fetch(`/api/article?id=${row.id}`).then((r) => r.json()).then((d) => { setData(d); const a = d.articles.find((x) => x.lang === 'en') || d.articles[0]; setBody(a?.body || ''); }); }, [row.id]);
  const art = data?.articles.find((a) => a.lang === lang);
  useEffect(() => { setBody(art?.body || ''); setEdit(false); }, [lang, data]);
  async function save() {
    await fetch('/api/article', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: row.id, lang, body }) });
    setEdit(false);
  }
  return (
    <div className="sheet">
      <header>
        <button onClick={close}>← back</button>
        <strong style={{ fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.title_en || row.title_fr}</strong>
        {edit ? <button className="solid" onClick={save}>save</button> : <button onClick={() => setEdit(true)} disabled={!art}>edit</button>}
      </header>
      <div className="tabs">
        <button className="chip" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
        <button className="chip" aria-pressed={lang === 'fr'} onClick={() => setLang('fr')}>Français</button>
        <button className="chip" onClick={async () => { await fetch('/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: [row.id], en: lang === 'en', fr: lang === 'fr', force: true }) }); const d = await (await fetch(`/api/article?id=${row.id}`)).json(); setData(d); }}>regenerate</button>
        <button className="chip" onClick={async () => { await fetch('/api/publish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: [row.id] }) }); alert('published'); }}>publish</button>
      </div>
      {art?.warnings && <p style={{ color: '#c0392b', font: '12px DM Mono, monospace', padding: '0 1rem' }}>⚠ {art.warnings}</p>}
      {!art && <p className="muted" style={{ padding: '0 1rem' }}>Not written yet.</p>}
      {art && (edit ? <textarea value={body} onChange={(e) => setBody(e.target.value)} /> : <pre>{art.body}</pre>)}
      {data?.cover && <p className="muted" style={{ padding: '1rem', font: '12px DM Mono, monospace' }}>cover ready{data.cover.published_at ? ' · published' : ''}</p>}
    </div>
  );
}

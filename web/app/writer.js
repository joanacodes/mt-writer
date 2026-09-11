'use client';
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';

const T = {
  write: 'Writes the selected articles now, English then French, two at a time while you watch. Full price. Keep this tab open.',
  en: 'Writes only the English, now. Skips rows already written unless you regenerate from inside the article.',
  fr: 'Adapts into French the rows whose English exists, now.',
  overnight: 'One tap, close the laptop: English batch → French batch → covers, all automatic in the background, half price. Results appear over the next hours.',
  batchEn: 'Sends the English to Anthropic’s queue: instant, half price, results within the hour (up to 24). Collected automatically.',
  batchFr: 'Same, for the French — for rows whose English is already in.',
  covers: 'Generates a cover image per selected article, now, from the prompt in its front matter.',
  publish: 'Commits the two Markdown files and the cover into the site repository. The site rebuilds in about a minute.',
  prepare: 'Fills the missing French (or English) title, keyword and slug for every row. Run once.',
};
const D = (s, lang) => ({ written: `${lang}: written and validated`, check: `${lang}: written, but something failed validation — open to see what`, queued: `${lang}: in a batch, waiting for results`, exists: `${lang}: already on the site`, todo: `${lang}: not written yet` })[s] || `${lang}: ${s}`;
const cls = (s) => (s === 'written' ? 'written' : s === 'check' ? 'check' : s === 'queued' ? 'queued' : '');

export default function Writer() {
  const [rows, setRows] = useState([]);
  const [sel, setSel] = useState(() => new Set());
  const [q, setQ] = useState(''); const [cat, setCat] = useState(''); const [st, setSt] = useState('');
  const [logs, setLogs] = useState([]); const [jobs, setJobs] = useState([]);
  const [busy, setBusy] = useState(''); const [open, setOpen] = useState(null);
  const [settings, setSettings] = useState(null);
  const [showLog, setShowLog] = useState(false);
  const [help, setHelp] = useState(false);

  const loadPlan = useCallback(async () => setRows(await (await fetch('/api/plan')).json()), []);
  useEffect(() => { loadPlan(); fetch('/api/settings').then((r) => r.json()).then(setSettings); fetch('/api/cron'); }, [loadPlan]);
  useEffect(() => {
    const t = setInterval(async () => {
      const s = await (await fetch('/api/logs')).json();
      setLogs(s.logs); setJobs(s.jobs);
      const st = await (await fetch('/api/settings')).json(); setSettings((prev) => prev ? { ...prev, spend: st.spend } : st);
      if (s.jobs.length) { await fetch('/api/cron'); }
      loadPlan();
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

  const [progress, setProgress] = useState('');
  const pauseRef = useRef(false); const [paused, setPaused] = useState(false); const stopRef = useRef(false);
  const waitIfPaused = async () => { while (pauseRef.current && !stopRef.current) await new Promise((r) => setTimeout(r, 800)); };
  /* Live actions run a few rows per request so Vercel's time limit is never hit; the loop is here, in the phone. */
  async function post(url, body, label, chunk = 3) {
    const all = body.ids || [];
    if (!all.length && !body.all) return alert('Select at least one article.');
    setBusy(label);
    if (!chunk) {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({})); if (j.error) alert(j.error);
    } else {
      stopRef.current = false;
      for (let i = 0; i < all.length; i += chunk) {
        await waitIfPaused(); if (stopRef.current) break;
        setProgress(`${Math.min(i + chunk, all.length)}/${all.length}`);
        const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, ids: all.slice(i, i + chunk) }) });
        const j = await r.json().catch(() => ({})); if (j.error) { alert(j.error); break; }
        loadPlan();
      }
    }
    setProgress(''); setBusy(''); pauseRef.current = false; setPaused(false); loadPlan(); fetch('/api/settings').then((r) => r.json()).then(setSettings);
  }
  async function prepare() {
    setBusy('prepare');
    for (let i = 0; i < 20; i++) {
      const j = await (await fetch('/api/prepare', { method: 'POST' })).json();
      setProgress(`${j.remaining ?? '?'} left`);
      if (!j.remaining) break;
    }
    setProgress(''); setBusy(''); loadPlan();
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
          <button className="chip" onClick={prepare} disabled={!!busy} title={T.prepare}>prepare titles</button>

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

      <div className="main">
      <div className="list">
        {shown.map((r) => (
          <div className="row" key={r.id}>
            <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t" onClick={() => setOpen(r)}>{r.title_en || r.title_fr}</div>
              <div className="s">
                <span className={`dot ${cls(r.status_en)}`} title={D(r.status_en, 'English')}><b />EN</span>
                <span className={`dot ${cls(r.status_fr)}`} title={D(r.status_fr, 'French')}><b />FR</span>
                <span className={`dot ${r.cover === 'done' ? 'written' : ''}`} title={r.cover === 'done' ? 'Cover image generated' : 'No cover yet'}><b />cover</span>
                <span>{r.category}</span><span>{r.length}w</span>
                <button className="chip" onClick={() => setOpen(r)}>open</button>
              </div>
              <textarea className="note" defaultValue={r.notes || ''} placeholder={r.angle || 'notes for the writer…'}
                onBlur={async (e) => { await fetch('/api/note', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: r.id, notes: e.target.value }) }); }} />
            </div>
          </div>
        ))}
      </div>

      </div>
      <button className={`logbubble${busy || jobs.length ? ' live' : ''}`} onClick={() => setShowLog((v) => !v)} title="Activity and costs">
        {busy ? `${progress || '…'} · ` : ''}{settings?.spend ? `$${settings.spend.today.toFixed(2)} today` : 'log'}
      </button>
      <div className={`log${showLog ? ' open' : ''}`}>
        <button className="close chip" onClick={() => setShowLog(false)}>close</button>
        {settings?.spend ? `$${settings.spend.today.toFixed(2)} today · $${settings.spend.total.toFixed(2)} total · ${settings.spend.calls} calls\n` : ''}
        {jobs.length ? `${jobs.length} batch job(s) running — results arrive on their own\n` : ''}
        {logs.map((l) => `${new Date(l.at).toLocaleTimeString()}  ${l.line}`).join('\n') || 'no activity yet'}
      </div>

      <div className="actions">
        <button className={busy ? "solid working" : "solid"} disabled={!!busy} title={T.write} onClick={() => post('/api/generate', { ids: ids(), en: true, fr: true }, 'both', 2)}>{busy ? (progress || '…') : `Write${sel.size ? ' ' + sel.size : ''}`}</button>
        <button disabled={!!busy} title={T.en} onClick={() => post('/api/generate', { ids: ids(), en: true, fr: false }, 'en', 3)}>EN</button>
        <button disabled={!!busy} title={T.fr} onClick={() => post('/api/generate', { ids: ids(), en: false, fr: true }, 'fr', 3)}>FR</button>
        <button className="gold solid" style={{ background: '#a88c52', color: '#fff' }} disabled={!!busy} title={T.overnight} onClick={() => { if (confirm(`Overnight: write ${sel.size} article(s) in English, then French, then the covers — all in the background, at half price. Go?`)) post('/api/batch', { ids: ids(), mode: 'en', chain: 'fr+covers' }, 'overnight', 0); }}>Overnight ½</button>
        <button className="gold" disabled={!!busy} title={T.batchEn} onClick={() => post('/api/batch', { ids: ids(), mode: 'en' }, 'batch', 0)}>Batch EN ½</button>
        <button className="gold" disabled={!!busy} title={T.batchFr} onClick={() => post('/api/batch', { ids: ids(), mode: 'fr' }, 'batchfr', 0)}>Batch FR ½</button>
        <button className="gold" disabled={!!busy} title={T.covers} onClick={() => post('/api/covers', { ids: ids() }, 'covers', 4)}>Covers</button>
        <button disabled={!!busy} title={T.publish} onClick={() => { if (confirm(`Publish ${sel.size} article(s) to the site repo?`)) post('/api/publish', { ids: ids() }, 'publish', 5); }}>Publish</button>
        {busy && <button onClick={() => { pauseRef.current = !pauseRef.current; setPaused(pauseRef.current); }} title="Pause after the current pair; resume where it stopped">{paused ? 'Resume' : 'Pause'}</button>}
        {busy && <button onClick={() => { if (confirm('Stop after the current pair? Finished articles are kept.')) { stopRef.current = true; pauseRef.current = false; } }} title="Stop the run after the pair in progress">Stop</button>}
        <button title="What each button does" onClick={() => setHelp(true)}>?</button>
      </div>

      {open && <Sheet row={open} close={() => { setOpen(null); loadPlan(); }} />}
      {help && (
        <div className="sheet">
          <header><button onClick={() => setHelp(false)}>← back</button><strong style={{ fontSize: 13 }}>What each button does</strong></header>
          <div style={{ padding: '1rem', fontSize: 14 }}>
            {[['Write', T.write], ['EN', T.en], ['FR', T.fr], ['Overnight ½', T.overnight], ['Batch EN ½', T.batchEn], ['Batch FR ½', T.batchFr], ['Covers', T.covers], ['Publish', T.publish], ['prepare titles', T.prepare]].map(([k, v]) => (
              <p key={k} style={{ margin: '0 0 .9rem' }}><b style={{ fontFamily: 'var(--d)' }}>{k}</b><br />{v}</p>
            ))}
            <p className="muted" style={{ fontSize: 12 }}>Dots: EN / FR / cover — grey not done, green done, gold queued, red needs a check. Batches and Overnight need the Supabase cron to be set (see README) to run while the app is closed.</p>
          </div>
        </div>
      )}
    </>
  );
}

function Sheet({ row, close }) {
  const [data, setData] = useState(null); const [lang, setLang] = useState('en'); const [edit, setEdit] = useState(false); const [body, setBody] = useState('');
  const load = () => fetch(`/api/article?id=${row.id}`).then((r) => r.json()).then((d) => { setData(d); });
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [row.id]);
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
      {!art && <p className="muted" style={{ padding: '0 1rem' }}>{row[`status_${lang}`] === 'queued' ? 'In a batch — this page refreshes itself when it lands.' : 'Not written yet. This page refreshes on its own every few seconds.'}</p>}
      {art && (edit ? <textarea value={body} onChange={(e) => setBody(e.target.value)} /> : <pre>{art.body}</pre>)}
      <p className="muted" style={{ padding: '1rem', font: '12px DM Mono, monospace' }}>{data?.cover ? `cover ready${data.cover.published_at ? ' · published' : ''} · ` : ''}{data ? `cost so far $${Number(data.cost || 0).toFixed(3)}` : ''}</p>
    </div>
  );
}

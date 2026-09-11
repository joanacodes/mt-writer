'use client';
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import Detail from './ui/Detail';
import Settings from './ui/Settings';
import Toasts, { toast } from './ui/Toasts';
import { useTheme } from './ui/theme';

const j = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({}));
const D = (s, l) => ({ written: `${l}: written and validated`, check: `${l}: written, but a check failed — open to see what`, queued: `${l}: in a batch, waiting`, exists: `${l}: already on the site`, todo: `${l}: not written yet` })[s] || `${l}: ${s}`;
const cls = (s) => (['written', 'check', 'queued', 'exists'].includes(s) ? s : '');
const HELP = {
  now: 'Writes the selected articles now, English then French, a couple at a time while you watch. Full price. Keep this tab open.',
  batch: 'Sends the English to Anthropic’s queue: instant, half price, results within the hour (up to 24), collected automatically.',
  overnight: 'One tap, close the laptop: English batch, then French batch, then covers if enabled in Settings — automatic, half price.',
  en: 'English only, now.', fr: 'French only, now, for rows whose English exists.', batchfr: 'French for the selection through the batch queue, half price.',
  covers: 'A cover image per selected article, now, from the prompt in its front matter.',
  publish: 'Commits the two Markdown files and the cover into the site repository. The site rebuilds in about a minute.',
  prepare: 'Fills in the missing French (or English) title, keyword and slug for every row. Run once.',
};

export default function Writer() {
  const [rows, setRows] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [q, setQ] = useState(''); const [cat, setCat] = useState(''); const [st, setSt] = useState('');
  const [logs, setLogs] = useState([]); const [jobs, setJobs] = useState([]);
  const [busy, setBusy] = useState(''); const [progress, setProgress] = useState('');
  const [open, setOpen] = useState(null);
  const [settings, setSettings] = useState(null);
  const [showLog, setShowLog] = useState(false); const [showSettings, setShowSettings] = useState(false); const [menu, setMenu] = useState('');
  const [theme, toggleTheme] = useTheme();
  const pauseRef = useRef(false); const [paused, setPaused] = useState(false); const stopRef = useRef(false);
  const [wide, setWide] = useState(false);

  const loadPlan = useCallback(async () => { const r = await fetch('/api/plan'); if (r.ok) setRows(await r.json()); }, []);
  const loadSettings = useCallback(async () => { const r = await fetch('/api/settings'); if (r.ok) setSettings(await r.json()); }, []);
  useEffect(() => { loadPlan(); loadSettings(); fetch('/api/cron'); const mq = matchMedia('(min-width: 1024px)'); const f = () => setWide(mq.matches); f(); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, [loadPlan, loadSettings]);
  useEffect(() => {
    const every = Math.max(3, Number(settings?.poll_seconds || 6)) * 1000;
    const t = setInterval(async () => {
      const r = await fetch('/api/logs'); if (!r.ok) return; const s = await r.json();
      setLogs(s.logs); setJobs(s.jobs); loadSettings();
      if (s.jobs.length) await fetch('/api/cron');
      loadPlan();
    }, every);
    return () => clearInterval(t);
  }, [loadPlan, loadSettings, settings?.poll_seconds]);
  useEffect(() => { const h = (e) => { if (!e.target.closest('.actions, .pop')) setMenu(''); }; document.addEventListener('click', h); return () => document.removeEventListener('click', h); }, []);

  const cats = useMemo(() => [...new Set((rows || []).map((r) => r.category))].sort(), [rows]);
  const shown = useMemo(() => (rows || []).filter((r) => (r.type === 'article' || r.type === 'pillar') && r.status_en !== 'merged'
    && (!cat || r.category === cat)
    && (!q || `${r.title_en} ${r.title_fr} ${r.notes}`.toLowerCase().includes(q.toLowerCase()))
    && (!st || (st === 'check' ? r.status_en === 'check' || r.status_fr === 'check'
      : st === 'written' ? ['written', 'exists'].includes(r.status_en) && ['written', 'exists'].includes(r.status_fr)
      : st === 'nocover' ? r.cover !== 'done'
      : st === 'queued' ? r.status_en === 'queued' || r.status_fr === 'queued'
      : st === 'notes' ? !!r.notes
      : r.status_en === 'todo' || r.status_fr === 'todo'))), [rows, q, cat, st]);
  const ids = () => [...sel];
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll = (on) => setSel((s) => { const n = new Set(s); shown.forEach((r) => (on ? n.add(r.id) : n.delete(r.id))); return n; });
  const waitIfPaused = async () => { while (pauseRef.current && !stopRef.current) await new Promise((r) => setTimeout(r, 800)); };

  const est = (kind) => {
    const a = settings?.avg; if (!a) return '';
    const n = sel.size; if (!n) return '';
    const v = kind === 'now' ? n * (a.en + a.fr) : kind === 'batch' ? n * a.batch_en : kind === 'overnight' ? n * (a.batch_en + (settings.overnight_fr !== '0' ? a.batch_fr : 0) + (settings.overnight_covers === '1' ? a.image : 0)) : kind === 'covers' ? n * a.image : kind === 'batchfr' ? n * a.batch_fr : 0;
    return v ? `≈ $${v.toFixed(2)}` : '';
  };

  async function run(url, body, label, chunk) {
    const all = body.ids || [];
    if (!all.length) return toast('Select at least one article.', 'err');
    setBusy(label); setMenu('');
    if (!chunk) { const r = await j(url, body); if (r.error) toast(r.error, 'err'); else toast(label === 'overnight' ? 'Overnight submitted — sleep well' : label.startsWith('batch') ? `Batch submitted: ${r.count} article(s)` : 'Done'); }
    else {
      stopRef.current = false;
      for (let i = 0; i < all.length; i += chunk) {
        await waitIfPaused(); if (stopRef.current) break;
        setProgress(`${Math.min(i + chunk, all.length)}/${all.length}`);
        const r = await j(url, { ...body, ids: all.slice(i, i + chunk) });
        if (r.error) { toast(r.error, 'err'); break; }
        loadPlan();
      }
      toast(stopRef.current ? 'Stopped' : 'Finished');
    }
    setProgress(''); setBusy(''); pauseRef.current = false; setPaused(false); loadPlan(); loadSettings();
  }
  async function prepare() {
    setBusy('prepare');
    for (let i = 0; i < 20; i++) { const r = await j('/api/prepare', {}); if (r.error) { toast(r.error, 'err'); break; } setProgress(`${r.remaining ?? '?'} left`); if (!r.remaining) break; }
    setProgress(''); setBusy(''); loadPlan(); toast('Titles prepared');
  }
  const confirmRun = (msg, ...args) => { if (confirm(msg)) run(...args); else setMenu(''); };
  const chunk = Number(settings?.chunk_live || 2);
  const stepsText = () => ['English'].concat(settings?.overnight_fr !== '0' ? ['French'] : [], settings?.overnight_covers === '1' ? ['covers'] : []).join(', then ');

  const spend = settings?.spend;
  return (
    <div className="app">
      <header className="top">
        <div className="bar">
          <span className="brand">MAISON TAROT</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="search titles and notes" />
          <select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">all categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>
          <span style={{ flex: 1 }} />
          <button className="ghost" title="Light / dark" onClick={toggleTheme}>{theme === 'dark' ? '☀' : '☾'}</button>
          <button className="ghost" title="Settings" onClick={() => setShowSettings(true)}>⚙</button>
        </div>
        <div className="chips">
          {[['', 'all'], ['todo', 'to write'], ['queued', 'in batch'], ['written', 'done'], ['check', 'needs a look'], ['nocover', 'no cover'], ['notes', 'with notes']].map(([v, l]) => <button key={v} className="chip" aria-pressed={st === v} onClick={() => setSt(v)}>{l}</button>)}
          <span className="chip mini" style={{ border: 0, color: 'var(--muted)' }}>{shown.length} shown · {sel.size} selected</span>
          <button className="chip" onClick={() => selectAll(true)}>select shown</button>
          <button className="chip" onClick={() => setSel(new Set())}>none</button>
          <button className="chip" onClick={prepare} disabled={!!busy} title={HELP.prepare}>prepare titles</button>
        </div>
      </header>

      <div className="main">
        <div className="list">
          {rows === null && <p className="empty">Loading…</p>}
          {(rows || []) && shown.map((r) => (
            <div className={`row${open?.id === r.id ? ' active' : ''}`} key={r.id} onClick={() => setOpen(r)}>
              <input type="checkbox" checked={sel.has(r.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(r.id)} />
              <div style={{ minWidth: 0 }}>
                <div className="t">{r.title_en || <em className="muted">{r.title_fr}</em>}</div>
                <div className="meta">
                  <span className={`dot ${cls(r.status_en)}`} title={D(r.status_en, 'English')}><b />EN</span>
                  <span className={`dot ${cls(r.status_fr)}`} title={D(r.status_fr, 'French')}><b />FR</span>
                  <span className={`dot ${r.cover === 'done' ? 'written' : ''}`} title={r.cover === 'done' ? 'Cover generated' : 'No cover yet'}><b />cover</span>
                  <span>{r.category}</span><span>{r.length}w</span>
                  {r.notes && <span className="note-ind" title={r.notes}>¶ notes</span>}
                </div>
              </div>
              <span className="open mono">open →</span>
            </div>
          ))}
        </div>
        {wide ? (open ? <Detail row={open} inline close={() => setOpen(null)} onChange={loadPlan} /> : <div className="detail"><p className="empty">Select an article to read it, write notes, regenerate or publish.</p></div>) : null}
      </div>

      {!wide && open && <Detail row={open} close={() => setOpen(null)} onChange={loadPlan} />}
      {showSettings && settings && <Settings settings={settings} setSettings={setSettings} close={() => setShowSettings(false)} theme={theme} toggleTheme={toggleTheme} />}

      <button className={`logbubble${busy || jobs.length ? ' live' : ''}`} onClick={() => setShowLog((v) => !v)} title="Activity and costs">
        {busy ? `${progress || '…'} · ` : ''}{spend ? `$${spend.today.toFixed(2)} today` : 'log'}
      </button>
      <div className={`log${showLog ? ' open' : ''}`}>
        <button className="close chip" onClick={() => setShowLog(false)}>close</button>
        {spend && <div>${spend.today.toFixed(2)} today · ${spend.total.toFixed(2)} total · {spend.calls} calls{settings?.daily_cap_usd > 0 ? ` · cap $${settings.daily_cap_usd}` : ''}</div>}
        {jobs.length ? <div className="w">{jobs.length} batch job(s) running — results arrive on their own</div> : null}
        {logs.map((l) => <div key={l.id} className={/ERROR/.test(l.line) ? 'err' : /⚠/.test(l.line) ? 'w' : /words|stored|published|generated/.test(l.line) ? 'ok' : ''}>{new Date(l.at).toLocaleTimeString()}  {l.line}</div>)}
        {!logs.length && <div>no activity yet</div>}
      </div>

      <div className="actions"><div className="inner" onClick={(e) => e.stopPropagation()}>
        <div className="menu">
          <button className={busy ? 'solid working' : 'solid'} disabled={!!busy} onClick={() => setMenu(menu === 'write' ? '' : 'write')} title="Choose how to write the selection">{busy ? (progress || '…') : `Write${sel.size ? ' ' + sel.size : ''} ▾`}</button>
        </div>
        <button className="gold" disabled={!!busy} title={HELP.covers} onClick={() => run('/api/covers', { ids: ids() }, 'covers', 4)}>Covers</button>
        <button disabled={!!busy} title={HELP.publish} onClick={() => { if (settings?.confirm_publish === '0' || confirm(`Publish ${sel.size} article(s) to the site?`)) run('/api/publish', { ids: ids() }, 'publish', 5); }}>Publish</button>
        {busy && busy !== 'prepare' && <><span className="sep" /><button onClick={() => { pauseRef.current = !pauseRef.current; setPaused(pauseRef.current); }}>{paused ? 'Resume' : 'Pause'}</button><button onClick={() => { if (confirm('Stop after the current pair? Finished articles are kept.')) { stopRef.current = true; pauseRef.current = false; } }}>Stop</button></>}
        <span className="est">{sel.size ? `${sel.size} selected` : 'select rows to act'}</span>
      </div></div>
      {menu === 'write' && (
            <div className="pop">
              <button onClick={() => run('/api/generate', { ids: ids(), en: true, fr: true }, 'now', chunk)}>Now, EN + FR <small>{HELP.now} {est('now')}</small></button>
              <button onClick={() => run('/api/generate', { ids: ids(), en: true, fr: false }, 'en', chunk + 1)}>Now, English only <small>{HELP.en}</small></button>
              <button onClick={() => run('/api/generate', { ids: ids(), en: false, fr: true }, 'fr', chunk + 1)}>Now, French only <small>{HELP.fr}</small></button>
              <button onClick={() => run('/api/batch', { ids: ids(), mode: 'en' }, 'batch', 0)}>Batch, English ½ <small>{HELP.batch} {est('batch')}</small></button>
              <button onClick={() => run('/api/batch', { ids: ids(), mode: 'fr' }, 'batchfr', 0)}>Batch, French ½ <small>{HELP.batchfr} {est('batchfr')}</small></button>
              <button onClick={() => confirmRun(`Overnight: ${sel.size} article(s) — ${stepsText()} — in the background, at half price. Go?`, '/api/batch', { ids: ids(), mode: 'en', chain: 'auto' }, 'overnight', 0)} style={{ color: 'var(--gold)' }}>Overnight ½ <small>{HELP.overnight} {est('overnight')}</small></button>
            </div>
          )}
      <Toasts />
    </div>
  );
}

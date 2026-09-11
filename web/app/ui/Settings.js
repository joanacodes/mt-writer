'use client';
import { useEffect, useState } from 'react';
import { toast } from './Toasts';

export default function Settings({ settings, setSettings, close, theme, toggleTheme }) {
  const [ref, setRef] = useState(null);
  useEffect(() => { fetch('/api/reference').then((r) => r.json()).then(setRef); }, []);
  async function save(patch) {
    setSettings({ ...settings, ...patch });
    await fetch('/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });
  }
  const Row = ({ label, hint, children }) => (<div className="setrow"><span><b>{label}</b><small>{hint}</small></span><span>{children}</span></div>);
  const Toggle = ({ k, label, hint }) => (<Row label={label} hint={hint}><label className="switch"><input type="checkbox" checked={settings[k] === '1'} onChange={(e) => save({ [k]: e.target.checked ? '1' : '0' })} /><span /></label></Row>);
  const Num = ({ k, label, hint, min, max, step }) => (<Row label={label} hint={hint}><input type="number" min={min} max={max} step={step || 1} value={settings[k] ?? ''} onChange={(e) => save({ [k]: e.target.value })} /></Row>);
  const Text = ({ k, label, hint }) => (<Row label={label} hint={hint}><input type="text" value={settings[k] || ''} onChange={(e) => save({ [k]: e.target.value })} /></Row>);
  const Model = ({ k1, k2, models, label, hint }) => (<Row label={label} hint={hint}><select value={`${settings[k1]}|${settings[k2]}`} onChange={(e) => { const [a, b] = e.target.value.split('|'); save({ [k1]: a, [k2]: b }); }}>{Object.entries(models).flatMap(([p, ms]) => ms.map((m) => <option key={p + m} value={`${p}|${m}`}>{p} · {m}</option>))}</select></Row>);
  async function upload(e) {
    const f = e.target.files?.[0]; if (!f) return;
    const b64 = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(f); });
    const r = await fetch('/api/reference', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: b64 }) }).then((x) => x.json());
    if (r.error) toast(r.error, 'err'); else { setRef({ present: true, updated_at: new Date().toISOString() }); toast('Reference photo saved'); }
  }
  async function maint(action, msg) { if (!confirm(msg)) return; await fetch('/api/maintenance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) }); toast('Done'); }
  const allText = Object.entries(settings.textModels || {}).flatMap(([p, ms]) => ms.map((m) => ({ p, m })));
  return (
    <div className="sheet detail">
      <div className="head"><button className="ghost" onClick={close}>← back</button><strong>Settings</strong></div>
      <div className="settings">
        <div className="card"><h3>Writing</h3>
          <Model k1="provider" k2="model" models={settings.textModels} label="Model" hint="Who writes the articles. Batch and Overnight need an Anthropic model." />
          <Row label="Cheap model" hint="Used for title preparation and other small jobs. Set to the writing model to disable."><select value={settings.cheap_model || 'none'} onChange={(e) => save({ cheap_model: e.target.value })}>{allText.map(({ p, m }) => <option key={m} value={m}>{p} · {m}</option>)}</select></Row>
          <Num k="max_retries" label="Second attempt when a draft is short" hint="The writer gets its own draft back to expand it. 0 = never; 1 = once. Each attempt costs about as much as the article." min={0} max={2} />
          <Num k="default_length" label="Default length (words)" hint="Used when a row has no length of its own." min={400} max={2500} step={50} />
          <Num k="chunk_live" label="Articles per request (Write)" hint="Lower it if you ever see timeouts." min={1} max={4} />
        </div>
        <div className="card"><h3>Money</h3>
          <Num k="daily_cap_usd" label="Daily cap (USD)" hint="Writing stops when today's spend reaches it. 0 = no cap." min={0} max={500} step={5} />
          <Row label="Right now" hint={`Today $${settings.spend?.today?.toFixed(2) ?? '0.00'} · total $${settings.spend?.total?.toFixed(2) ?? '0.00'} · ${settings.spend?.calls ?? 0} calls`}><span className="mono">avg EN ${settings.avg?.en?.toFixed(2)} · FR ${settings.avg?.fr?.toFixed(2)}</span></Row>
        </div>
        <div className="card"><h3>Overnight</h3>
          <Toggle k="overnight_fr" label="Then French" hint="Submit the French batch automatically when the English lands." />
          <Toggle k="overnight_covers" label="Then covers" hint="Generate cover images after the text. Keep off until the visual style is settled." />
        </div>
        <div className="card"><h3>Covers</h3>
          <Model k1="image_provider" k2="image_model" models={settings.imageModels} label="Image model" hint="Google matches a reference photo; OpenAI doesn't." />
          <Row label="Reference photo" hint={ref?.present ? `Set on ${new Date(ref.updated_at).toLocaleDateString()}. Every cover is generated in its style.` : 'None. Upload a JPEG you like; every cover will match it.'}><span style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}><input type="file" accept="image/jpeg" onChange={upload} style={{ width: '8.5rem', fontSize: 12 }} />{ref?.present && <button className="chip" onClick={async () => { await fetch('/api/reference', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: '' }) }); setRef({ present: false }); }}>remove</button>}</span></Row>
        </div>
        <div className="card"><h3>Publishing</h3>
          <Text k="publish_prefix" label="Commit message prefix" hint="Appears in the site repository's history." />
          <Toggle k="publish_covers" label="Publish covers with articles" hint="Off: only the two Markdown files are committed." />
          <Toggle k="confirm_publish" label="Ask before publishing" hint="A confirmation on the Publish button." />
        </div>
        <div className="card"><h3>Interface</h3>
          <Row label="Theme" hint="Follows your device until you choose."><button className="chip" onClick={toggleTheme}>{theme === 'dark' ? 'dark → light' : 'light → dark'}</button></Row>
          <Num k="poll_seconds" label="Refresh every (seconds)" hint="How often the list, the log and the spend update." min={3} max={60} />
        </div>
        <div className="card"><h3>Housekeeping</h3>
          <Row label="Clear the log" hint="Removes the activity lines. Costs are kept."><button className="chip" onClick={() => maint('clear_logs', 'Clear the activity log?')}>clear</button></Row>
          <Row label="Reset queued rows" hint="If a batch was lost: rows back to “to write”, open jobs abandoned."><button className="chip" onClick={() => maint('reset_queued', 'Reset all queued rows and abandon open batches?')}>reset</button></Row>
          <Row label="Empty the cover queue" hint="Drops pending and failed cover jobs."><button className="chip" onClick={() => maint('clear_cover_queue', 'Empty the cover queue?')}>empty</button></Row>
          <Row label="Sign out" hint="On this device."><button className="chip" onClick={async () => { await fetch('/api/auth', { method: 'DELETE' }); location.reload(); }}>sign out</button></Row>
        </div>
        <p className="muted small">The prompts, brand book, facts and examples are edited in Supabase → Table editor → docs. Prices per model: same table, row “prices”.</p>
      </div>
    </div>
  );
}

'use client';
import { useState } from 'react';

export default function Login() {
  const [p, setP] = useState(''); const [err, setErr] = useState('');
  async function go(e) {
    e.preventDefault();
    const r = await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: p }) });
    if (r.ok) location.reload(); else setErr('Wrong password.');
  }
  return (
    <div className="center">
      <form className="card" onSubmit={go}>
        <p className="brand">MAISON TAROT</p>
        <h1>Writer</h1>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Private. One password.</p>
        <input type="password" value={p} onChange={(e) => setP(e.target.value)} placeholder="password" style={{ width: '100%', border: '1px solid #e4e4e4', borderRadius: 999, padding: '.6em 1em', margin: '.8rem 0' }} autoFocus />
        <button className="solid" style={{ width: '100%' }}>Enter</button>
        {err && <p style={{ color: '#c0392b', fontSize: 13 }}>{err}</p>}
      </form>
    </div>
  );
}

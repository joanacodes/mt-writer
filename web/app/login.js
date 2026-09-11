'use client';
import { useState } from 'react';

export default function Login() {
  const [p, setP] = useState(''); const [err, setErr] = useState('');
  async function go(e) {
    e.preventDefault();
    const r = await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: p }) });
    if (r.ok) location.reload(); else setErr(r.status === 429 ? 'Too many attempts. Wait fifteen minutes.' : 'Wrong password.');
  }
  return (
    <div className="center">
      <form className="logincard" onSubmit={go}>
        <p className="brand">MAISON TAROT</p>
        <h1>Writer</h1>
        <p className="muted small" style={{ marginTop: 0 }}>Private. One password.</p>
        <input type="password" value={p} onChange={(e) => setP(e.target.value)} placeholder="password" autoFocus />
        <button className="solid" style={{ width: '100%' }}>Enter</button>
        {err && <p style={{ color: 'var(--red)', fontSize: 13 }}>{err}</p>}
      </form>
    </div>
  );
}

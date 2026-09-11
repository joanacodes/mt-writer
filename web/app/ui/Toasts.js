'use client';
import { useEffect, useState } from 'react';
let push = () => {};
export const toast = (msg, kind = '') => push({ msg, kind, id: Math.random() });
export default function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => { push = (t) => { setItems((s) => [...s, t]); setTimeout(() => setItems((s) => s.filter((x) => x.id !== t.id)), 3600); }; return () => { push = () => {}; }; }, []);
  return <div className="toasts">{items.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>)}</div>;
}

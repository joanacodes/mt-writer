'use client';
import { useEffect, useState } from 'react';
export function useTheme() {
  const [theme, setTheme] = useState('light');
  useEffect(() => {
    const saved = localStorage.getItem('mt_theme');
    const sys = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const t = saved || sys; setTheme(t); document.documentElement.dataset.theme = t;
  }, []);
  const toggle = () => { const t = theme === 'dark' ? 'light' : 'dark'; setTheme(t); localStorage.setItem('mt_theme', t); document.documentElement.dataset.theme = t; };
  return [theme, toggle];
}

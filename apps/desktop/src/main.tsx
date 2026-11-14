import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App.js';
import './ui/styles.css';

const requestedTheme = new URLSearchParams(window.location.search).get('theme');
const storedTheme = window.localStorage.getItem('thesis-ledger-theme');
let initialTheme: 'light' | 'dark' | 'system' = 'system';
if (requestedTheme === 'light' || requestedTheme === 'dark' || requestedTheme === 'system') {
  initialTheme = requestedTheme;
} else if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system') {
  initialTheme = storedTheme;
}
let initialResolvedTheme: 'light' | 'dark';
if (initialTheme === 'system') {
  initialResolvedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
} else {
  initialResolvedTheme = initialTheme;
}
document.documentElement.dataset.theme = initialTheme;
document.documentElement.classList.toggle('dark', initialResolvedTheme === 'dark');
document.documentElement.style.colorScheme = initialResolvedTheme;
let storedMarketColorScheme: string | null = null;
try {
  storedMarketColorScheme = window.localStorage.getItem('thesis-ledger-market-color-scheme');
} catch {
  // MarketColorProvider surfaces storage failures after the application mounts.
}
document.documentElement.dataset.marketColorScheme =
  storedMarketColorScheme === 'green-up' ? 'green-up' : 'red-up';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

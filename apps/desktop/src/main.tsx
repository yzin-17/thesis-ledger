import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { ThemeProvider } from './ui/theme.js';
import { App } from './ui/App.js';
import './ui/styles.css';

const requestedTheme = new URLSearchParams(window.location.search).get('theme');
const storedTheme = window.localStorage.getItem('investment-os-theme');
const initialTheme =
  requestedTheme === 'light' || requestedTheme === 'dark' || requestedTheme === 'system'
    ? requestedTheme
    : storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system'
      ? storedTheme
      : 'system';
const initialResolvedTheme =
  initialTheme === 'system'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
    : initialTheme;
document.documentElement.dataset.theme = initialTheme;
document.documentElement.classList.toggle('dark', initialResolvedTheme === 'dark');
document.documentElement.style.colorScheme = initialResolvedTheme;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

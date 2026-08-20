import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from './components/ui/toast.js';
import { ThemeProvider } from './ui/theme.js';
import { App } from './ui/App.js';
import './ui/styles.css';

const requestedTheme = new URLSearchParams(window.location.search).get('theme');
const storedTheme = window.localStorage.getItem('thesis-ledger-theme');
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <Toaster>
            <App />
          </Toaster>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);

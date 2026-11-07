/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import { codeInspectorPlugin } from 'code-inspector-plugin';

export default defineConfig(({ command }) => ({
  plugins: [
    codeInspectorPlugin({
      bundler: 'vite',
      dev: () => command === 'serve' && process.env.VITEST !== 'true',
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': process.env.THESIS_LEDGER_API_URL || 'http://localhost:3000' },
  },
  test: {
    poolOptions: {
      forks: {
        // 浏览器存储由 jsdom 提供，避免宿主 Node 的全局实现抢占。
        execArgv: ['--no-experimental-webstorage'],
      },
    },
  },
  build: { sourcemap: true },
}));

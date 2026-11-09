import { defineConfig } from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: /^\.\/market-detail\.api\.js$/,
        replacement: path.resolve(__dirname, 'minute-auto-refresh-fixture.ts'),
      },
      { find: '@', replacement: path.resolve(__dirname, '../src') },
    ],
  },
  server: { port: 5186, strictPort: true },
});

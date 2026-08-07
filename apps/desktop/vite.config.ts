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
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
  build: { sourcemap: true },
}));

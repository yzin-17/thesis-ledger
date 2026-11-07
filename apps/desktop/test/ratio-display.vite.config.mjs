import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const desktop = path.resolve(__dirname, '..');
const workspace = path.resolve(desktop, '../..');
export default defineConfig({
  root: desktop,
  plugins: [
    {
      name: 'ratio-display-native-boundaries',
      enforce: 'pre',
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          return html
            .replace(
              '/__mobile-decimal-ratio-entry__',
              '/@fs' + path.join(workspace, 'apps/mobile/test/browser-decimal-ratio-display.tsx'),
            )
            .replace(
              '/__mobile-ratio-entry__',
              '/@fs' + path.join(workspace, 'apps/mobile/test/browser-ratio-display.tsx'),
            );
        },
      },
      resolveId(source, importer) {
        if (!importer || !source.startsWith('.')) return null;
        const resolved = path.resolve(path.dirname(importer), source).replace(/\.tsx?$/, '');
        if (resolved === path.join(workspace, 'apps/mobile/src/app/MobileRuntime'))
          return path.join(workspace, 'apps/mobile/test/browser-ratio-mobile-runtime.ts');
        if (resolved === path.join(workspace, 'apps/mobile/src/platform/charts/MobileChart'))
          return path.join(workspace, 'apps/mobile/test/browser-ratio-native-chart.tsx');
        return null;
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: [
      { find: '@', replacement: path.join(desktop, 'src') },
      {
        find: /^react-native$/,
        replacement: path.join(workspace, 'apps/mobile/node_modules/react-native-web'),
      },
    ],
    dedupe: ['react', 'react-dom'],
  },
  server: { host: '127.0.0.1', port: 5181, strictPort: true, fs: { allow: [workspace] } },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
const desktop = path.resolve(import.meta.dirname, '..');
const workspace = path.resolve(desktop, '../..');
const runtime = path.join(
  workspace,
  'apps/mobile/test/browser-strategy-definition-editor-runtime.ts',
);
export default defineConfig({
  root: desktop,
  plugins: [
    {
      name: 'strategy-editor-native-boundaries',
      enforce: 'pre',
      transformIndexHtml: {
        order: 'pre',
        handler: (html) =>
          html.replace(
            '/__mobile-strategy-editor__',
            '/@fs' +
              path.join(workspace, 'apps/mobile/test/browser-strategy-definition-editor.tsx'),
          ),
      },
      resolveId(source, importer) {
        if (
          importer &&
          source.startsWith('.') &&
          path.resolve(path.dirname(importer), source).replace(/\.tsx?$/, '') ===
            path.join(workspace, 'apps/mobile/src/app/MobileRuntime')
        )
          return runtime;
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
      { find: '@react-navigation/native', replacement: runtime },
      { find: '@react-native-async-storage/async-storage', replacement: runtime },
    ],
    dedupe: ['react', 'react-dom'],
  },
  server: { host: '127.0.0.1', port: 5192, strictPort: true, fs: { allow: [workspace] } },
});

import { defineConfig } from 'vite';
import path from 'node:path';
import ratioConfig from './ratio-display.vite.config.mjs';

const workspace = path.resolve(__dirname, '../../..');
const runtime = path.join(workspace, 'apps/mobile/test/browser-arena-refresh-runtime.ts');
export default defineConfig({
  ...ratioConfig,
  plugins: [
    {
      name: 'arena-refresh-native-boundaries',
      enforce: 'pre',
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          return html.replace(
            '/__mobile-arena-refresh-entry__',
            '/@fs' + path.join(workspace, 'apps/mobile/test/browser-arena-refresh.tsx'),
          );
        },
      },
      resolveId(source, importer) {
        if (!importer) return null;
        if (source === '@react-navigation/native') return runtime;
        if (!source.startsWith('.')) return null;
        const resolved = path
          .resolve(path.dirname(importer), source)
          .replace(/\.[cm]?[jt]sx?$/, '');
        if (resolved === path.join(workspace, 'apps/mobile/src/app/MobileRuntime')) return runtime;
        return null;
      },
    },
    ...ratioConfig.plugins,
  ],
});

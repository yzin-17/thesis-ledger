import { defineConfig } from 'vite';
import path from 'node:path';
import ratioConfig from './ratio-display.vite.config.mjs';
const workspace = path.resolve(__dirname, '../../..');
export default defineConfig({
  ...ratioConfig,
  plugins: [
    {
      name: 'fund-daily-number-native-boundaries',
      enforce: 'pre',
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          return html.replace(
            '/__mobile-fund-daily-number-entry__',
            '/@fs' + path.join(workspace, 'apps/mobile/test/browser-fund-daily-number.tsx'),
          );
        },
      },
      resolveId(source, importer) {
        if (!importer || !source.startsWith('.')) return null;
        const resolved = path
          .resolve(path.dirname(importer), source)
          .replace(/\.[cm]?[jt]sx?$/, '');
        if (resolved === path.join(workspace, 'apps/mobile/src/app/MobileRuntime'))
          return path.join(workspace, 'apps/mobile/test/browser-fund-daily-number-runtime.ts');
        return null;
      },
    },
    ...ratioConfig.plugins,
  ],
});

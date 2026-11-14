import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ratioConfig from './ratio-display.vite.config.mjs';
const workspace = path.resolve(__dirname, '../../..');
const runtime = path.join(workspace, 'apps/mobile/test/browser-arena-live-runtime.ts');
const library = readFileSync(path.join(workspace, 'apps/desktop/node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.js'), 'utf8');
export default defineConfig({ ...ratioConfig,
  define: { __MOBILE_CHART_LIBRARY__: '(() => ' + JSON.stringify(library) + ')' },
  plugins: [{ name: 'arena-live-consumer-boundaries', enforce: 'pre',
    transformIndexHtml: { order: 'pre', handler: (html) => html
      .replace('/__mobile-arena-live-entry__', '/@fs' + path.join(workspace, 'apps/mobile/test/browser-arena-live.tsx'))
      .replace('/__mobile-multiselect-entry__', '/@fs' + path.join(workspace, 'apps/mobile/test/browser-multiselect.tsx')) },
    resolveId(source, importer) {
      if (!importer) return null;
      if (source === '@react-navigation/native') return runtime;
      if (!source.startsWith('.')) return null;
      const resolved = path.resolve(path.dirname(importer), source).replace(/\.[cm]?[jt]sx?$/, '');
      if (resolved === path.join(workspace, 'apps/mobile/src/app/MobileRuntime')) return runtime;
      if (resolved === path.join(workspace, 'apps/mobile/src/platform/charts/MobileChart')) return path.join(workspace, 'apps/mobile/test/browser-arena-live-chart.tsx');
      return null;
    },
  }, ...ratioConfig.plugins], server: { ...ratioConfig.server, port: 5188 },
});

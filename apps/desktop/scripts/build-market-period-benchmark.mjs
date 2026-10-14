import { build } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
await build({ root, configFile: `${root}/vite.config.ts`, build: {
  outDir: '/private/tmp/thesis-ledger-market-period-benchmark', emptyOutDir: false,
  rollupOptions: { input: `${root}/test/market-period-benchmark.html` },
} });

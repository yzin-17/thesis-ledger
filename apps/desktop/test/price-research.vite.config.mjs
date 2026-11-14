import { defineConfig, mergeConfig } from 'vite';
import base from './ratio-display.vite.config.mjs';
import { fileURLToPath } from 'node:url';
const mobile = fileURLToPath(
  new URL('../../mobile/test/browser-price-research.tsx', import.meta.url),
);
export default mergeConfig(
  base,
  defineConfig({
    plugins: [
      {
        name: 'price-research-mobile-entry',
        transformIndexHtml: {
          order: 'pre',
          handler: (html) => html.replace('/__mobile-price-research-entry__', '/@fs' + mobile),
        },
      },
    ],
    server: { port: 5187 },
  }),
);

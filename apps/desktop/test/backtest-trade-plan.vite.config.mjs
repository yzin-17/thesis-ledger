import { defineConfig, mergeConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import base from './ratio-display.vite.config.mjs';
export default mergeConfig(
  base,
  defineConfig({
    plugins: [
      {
        name: 'backtest-trade-plan-mobile',
        transformIndexHtml: {
          order: 'pre',
          handler: (html) =>
            html.replace(
              '/__mobile-backtest-plan__',
              '/@fs' +
                fileURLToPath(
                  new URL('../../mobile/test/browser-backtest-trade-plan.tsx', import.meta.url),
                ),
            ),
        },
      },
    ],
    resolve: {
      alias: [
        {
          find: '@react-navigation/native',
          replacement: fileURLToPath(
            new URL('./browser-backtest-trade-plan-navigation.ts', import.meta.url),
          ),
        },
      ],
    },
    server: { port: 5197 },
  }),
);

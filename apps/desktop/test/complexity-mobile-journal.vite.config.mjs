import path from 'node:path';
import config from './watchlist-number.vite.config.mjs';

export default {
  ...config,
  plugins: [
    {
      name: 'complexity-mobile-journal-entry',
      transformIndexHtml(html) {
        return html.replace(
          '/__mobile-complexity-journal-entry__',
          '/@fs' + path.resolve(__dirname, '../../mobile/test/browser-complexity-journal.tsx'),
        );
      },
    },
    ...config.plugins,
  ],
  resolve: {
    ...config.resolve,
    alias: [
      {
        find: '@react-navigation/native',
        replacement: path.resolve(
          __dirname,
          '../../mobile/test/browser-complexity-journal-navigation.ts',
        ),
      },
      ...config.resolve.alias,
    ],
  },
};

// 真实 Desktop 只读验收；Mobile 使用只读摘要副本，不连接外部模型。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer as createNetServer } from 'node:net';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../..', import.meta.url));
const desktop = resolve(root, 'apps/desktop');
const mobile = resolve(root, 'apps/mobile');
const { createServer, transformWithEsbuild } = await import(
  pathToFileURL(require.resolve('vite', { paths: [desktop] })).href
);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = process.env.AI_STATUS_QA_ORIGIN ?? 'http://127.0.0.1:5173';
const apiOrigin = process.env.AI_STATUS_QA_API_ORIGIN ?? 'http://127.0.0.1:3000';
const output = process.env.AI_STATUS_QA_OUTPUT ?? '/tmp/ai-provider-status-qa';
const read = async () => {
  const response = await fetch(apiOrigin + '/api/v1/ai/providers');
  assert(response.ok);
  const provider = (await response.json()).find((row) => row.name === 'cloudflare');
  assert(provider);
  return provider;
};
const source = await read();
const configuration = (provider) =>
  JSON.stringify({
    updatedAt: provider.updatedAt,
    modelPricing: provider.modelPricing,
    routes: provider.executionRoutes.map(
      ({ model, contract, mode, readiness, liveValidation }) => ({
        model,
        contract,
        mode,
        fingerprint: readiness.configurationFingerprint,
        liveValidation,
      }),
    ),
  });
const baseline = configuration(source);
await mkdir(output, { recursive: true });
const reservation = createNetServer();
await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
const availablePort = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {AiProvidersScreen} from '/src/features/ai-providers/AiProvidersScreen.tsx';
const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={client}><AiProvidersScreen navigation={{navigate(){}}} /></QueryClientProvider>
);`;
const server = await createServer({
  root: mobile,
  configFile: false,
  logLevel: 'error',
  cacheDir: '/tmp/ai-provider-status-vite-cache',
  optimizeDeps: {
    entries: [],
    include: [
      'react',
      'react/jsx-runtime',
      'react-dom/client',
      'react-native',
      '@tanstack/react-query',
    ],
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      {
        find: /^react-native$/,
        replacement: require.resolve('react-native-web', { paths: [mobile] }),
      },
      {
        find: /^(?:\.\.\/)+(?:app\/)?MobileRuntime$/,
        replacement: resolve(mobile, 'test/browser-risk-notification-runtime.ts'),
      },
    ],
  },
  esbuild: { jsx: 'automatic' },
  plugins: [
    {
      name: 'ai-provider-status-qa',
      resolveId(id) {
        if (id === '/qa-entry.tsx') return '\0qa-entry.tsx';
      },
      async load(id) {
        if (id === '\0qa-entry.tsx')
          return (
            await transformWithEsbuild(entry, 'qa-entry.tsx', { loader: 'tsx', jsx: 'automatic' })
          ).code;
      },
      configureServer(vite) {
        vite.middlewares.use('/qa', async (_req, res) => {
          res.setHeader('content-type', 'text/html');
          res.end(
            await vite.transformIndexHtml(
              '/qa',
              '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0"><div id="root"></div><script type="module" src="/qa-entry.tsx"></script></body></html>',
            ),
          );
        });
      },
    },
  ],
  server: { host: '127.0.0.1', port: availablePort, strictPort: true, fs: { allow: [root] } },
});
await server.listen();
const address = server.httpServer.address();
assert(address && typeof address === 'object');
const mobileOrigin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const surface of (process.env.AI_STATUS_QA_SURFACES ?? 'desktop,mobile').split(','))
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      page.setDefaultTimeout(15000);
      const errors = [],
        writes = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route(
        (url) => url.pathname.startsWith('/api/'),
        async (route) => {
          const request = route.request();
          if (request.method() !== 'GET') {
            writes.push(request.method());
            return route.abort();
          }
          if (surface === 'desktop') return route.continue();
          if (new URL(request.url()).pathname.endsWith('/ai/providers'))
            return route.fulfill({ json: [source] });
          return route.fulfill({ json: { researchDefault: null, revision: 'qa', candidates: [] } });
        },
      );
      await page.goto(surface === 'desktop' ? origin + '/providers' : mobileOrigin + '/qa');
      const region =
        surface === 'desktop'
          ? page.getByRole('row').filter({ has: page.getByText('cloudflare', { exact: true }) })
          : page.locator('body');
      await region
        .getByText('配置待处理 1/2', { exact: surface === 'desktop' })
        .waitFor()
        .catch(async (error) => {
          console.log(
            JSON.stringify({
              surface,
              errors,
              text: (await page.locator('body').innerText()).slice(0, 800),
            }),
          );
          await page.screenshot({ path: `${output}/${surface}-failure.png` });
          throw error;
        });
      assert((await region.innerText()).includes('模拟交易决策 V1'));
      assert((await region.innerText()).includes('竞技场自主研究 V2'));
      assert((await region.innerText()).includes('待任务费用授权'));
      assert((await region.innerText()).includes('历史用途测试通过'));
      assert(!(await region.innerText()).includes('adapter 契约证据'));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await region.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/${surface}-${width}.png`, fullPage: true });
      if (surface === 'desktop') {
        await region.getByRole('button', { name: '编辑', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('tab', { name: '模型与用途', exact: true }).click();
        await dialog
          .getByText('选择需要的任务并测试保存；付费调用还需在具体任务中授权费用。', {
            exact: true,
          })
          .waitFor();
        await dialog.getByRole('tab', { name: '连接配置', exact: true }).click();
        await dialog.getByRole('button', { name: '取消', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(writes, []);
      console.log(JSON.stringify({ surface, width, errors: 0, writes: 0, status: '通过' }));
      await page.close();
    }
  assert.equal(configuration(await read()), baseline, '真实配置与验证记录应保持不变');
} finally {
  await browser.close();
  await server.close();
}

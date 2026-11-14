import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../..', import.meta.url));
const mobile = resolve(root, 'apps/mobile');
const { createServer } = await import(
  pathToFileURL(require.resolve('vite', { paths: [resolve(root, 'apps/desktop')] })).href
);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const output = process.env.RISK_MOBILE_QA_OUTPUT ?? '/tmp/risk-notification-mobile-qa';
await mkdir(output, { recursive: true });
const runtime = resolve(mobile, 'test/browser-risk-notification-runtime.ts');
const server = await createServer({
  configFile: false,
  root: mobile,
  logLevel: 'error',
  cacheDir: '/tmp/risk-notification-mobile-vite-cache',
  optimizeDeps: { entries: ['test/browser-risk-notification.html'] },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      {
        find: /^react-native$/,
        replacement: require.resolve('react-native-web', { paths: [mobile] }),
      },
      { find: /^(?:\.\.\/)+(?:app\/)?MobileRuntime$/, replacement: runtime },
    ],
  },
  esbuild: { jsx: 'automatic' },
  server: { host: '127.0.0.1', port: 5196, strictPort: true, fs: { allow: [root] } },
});
await server.listen();
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const sample = {
  id: '22222222-2222-4222-8222-222222222222',
  version: 2,
  kind: 'price-below',
  scope: 'security',
  severity: 'warning',
  threshold: 3,
  enabled: false,
  archivedAt: null,
  needsRepair: false,
  repairReason: null,
  symbol: '600519.SH',
  accountId: null,
  effectiveAt: '2026-11-12T00:00:00Z',
};
const results = [];
let activePage;
try {
  for (const width of [1440, 1024, 768, 390])
    for (const mode of ['create', 'edit', 'strategy']) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      activePage = page;
      page.setDefaultTimeout(10000);
      const errors = [],
        submissions = [];
      let fail = true;
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route(
        (url) => url.pathname.startsWith('/api/'),
        async (route) => {
          const request = route.request(),
            path = new URL(request.url()).pathname;
          if (path.endsWith('/routing/risk'))
            return route.fulfill({
              json: {
                availableRoutes: [
                  { channel: 'feishu', provider: '主要通知', priority: 1 },
                  { channel: 'feishu', provider: '备用通知', priority: 2 },
                ],
                selectedProviders: ['主要通知'],
                updatedAt: null,
              },
            });
          if (request.method() !== 'GET') {
            const body = JSON.parse(request.postData() ?? '{}');
            submissions.push(body);
            if (fail) {
              fail = false;
              return route.fulfill({ status: 503, json: { message: '受控保存失败' } });
            }
            return route.fulfill({ json: { ...sample, ...body } });
          }
          return route.fulfill({ json: [] });
        },
      );
      await page.goto(`http://127.0.0.1:5196/test/browser-risk-notification.html?mode=${mode}`);
      if (mode === 'create') {
        await page.getByRole('radio', { name: '样本标的 · 600519.SH', exact: true }).click();
        await page.getByLabel('风险阈值（数值）', { exact: true }).fill('10');
      }
      const cooldown = page.getByLabel(
        mode === 'strategy' ? '默认冷却时间（分钟）' : '通知冷却时间（分钟）',
        { exact: true },
      );
      assert.equal(await cooldown.inputValue(), mode === 'edit' ? '90' : '30');
      await cooldown.fill('0');
      const provider = page.getByRole('switch', { name: '通知提供方 备用通知', exact: true });
      if (!(await provider.isChecked())) await provider.click();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
      await page.screenshot({
        path: `${output}/${mode}-${width}.png`,
        fullPage: true,
        animations: 'disabled',
      });
      const save = page.getByRole('button', {
        name: mode === 'strategy' ? '保存通知设置' : '保存风险规则',
        exact: true,
      });
      await Promise.all([
        page.waitForResponse((response) => response.status() === 503),
        save.click(),
      ]);
      assert.equal(await cooldown.inputValue(), '0');
      if (mode !== 'strategy')
        await page.getByRole('button', { name: '重新核对风险规则', exact: true }).click();
      await save.click();
      await page
        .getByText(mode === 'strategy' ? '通知设置已保存' : '规则已保存至版本 2。', { exact: true })
        .waitFor();
      assert.equal(submissions.length, 2);
      const notification = mode === 'strategy' ? submissions[1] : submissions[1].notification;
      assert.equal(notification.cooldownMinutes, 0);
      assert.deepEqual(notification.providers, ['备用通知']);
      assert.deepEqual(errors, []);
      results.push({ width, mode, status: '通过', submissions: 2 });
      await page.close();
    }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} catch (error) {
  console.error((await activePage?.locator('body').innerText())?.slice(-1800));
  await activePage?.screenshot({ path: `${output}/failure.png`, fullPage: true });
  throw error;
} finally {
  await browser.close();
  await server.close();
}

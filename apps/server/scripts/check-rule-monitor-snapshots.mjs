import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
require('reflect-metadata');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const root = fileURLToPath(new URL('../../..', import.meta.url));
const dsaRoot = resolve(root, '../daily-stock-analysis');
const child = spawn(
  resolve(dsaRoot, '.venv/bin/python'),
  ['-m', 'tests.fixtures.rule_monitor_snapshot_app'],
  {
    cwd: dsaRoot,
    env: { ...process.env, THESIS_LEDGER_CONTROL_TOKEN: 'isolated-snapshot-control' },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let app;
try {
  const port = await new Promise((resolvePort, reject) => {
    const timer = setTimeout(() => reject(new Error('隔离 DSA 启动超时')), 10000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`隔离 DSA 退出 ${code}`));
    });
    child.stdout.on('data', (data) => {
      const match = String(data).match(/snapshot-listen:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolvePort(Number(match[1]));
      }
    });
    child.stderr.on('data', (data) => process.stderr.write(data));
  });
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://isolated@127.0.0.1/unused',
    REDIS_URL: 'redis://127.0.0.1:1',
    DSA_BASE_URL: `http://127.0.0.1:${port}`,
    THESIS_LEDGER_DSA_TOKEN: 'isolated-data',
    THESIS_LEDGER_CONTROL_TOKEN: 'isolated-snapshot-control',
    CREDENTIAL_ENCRYPTION_KEY: 'isolated-snapshot-key-only',
  });
  const { DsaClient } = await import('../dist/src/integration/dsa/dsa.client.js');
  const { MarketRuleMonitorController } =
    await import('../dist/src/market/market-rule-monitor.controller.js');
  class SnapshotModule {}
  Module({ controllers: [MarketRuleMonitorController], providers: [DsaClient] })(SnapshotModule);
  app = await NestFactory.create(SnapshotModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  const { ThesisLedgerApiClient } = await import('../../../packages/api-client/dist/index.js');
  const client = new ThesisLedgerApiClient(await app.getUrl());
  const identity = 'https://www.sse.com.cn/rule';
  const list = await client.market.getRuleMonitorVersions('document', identity);
  assert.equal(list.versions.length, 2);
  const detail = await client.market.getRuleMonitorVersion({
    kind: 'document',
    identity,
    contentHash: list.versions[0].contentHash,
    baseHash: list.versions[1].contentHash,
  });
  assert.equal(detail.snapshot.status, 'available');
  assert(detail.snapshot.text.includes('收费比例0.2%'));
  assert.equal(detail.comparison.added, 1);
  assert.equal(detail.comparison.removed, 1);
  assert(
    detail.comparison.lines.some((line) => line.type === 'removed' && line.text === '收费比例0.1%'),
  );
  if (process.env.SNAPSHOT_QA_BROWSER === '1') {
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.SNAPSHOT_CHROMIUM_EXECUTABLE,
    });
    const output = '/tmp/rule-monitor-snapshot-http-browser';
    mkdirSync(output, { recursive: true });
    try {
      for (const width of [1440, 1024, 768, 390]) {
        const page = await browser.newPage({
          viewport: { width, height: 1000 },
          reducedMotion: 'reduce',
        });
        const writes = [];
        await page.route('**/api/**', async (route) => {
          const req = route.request(),
            url = new URL(req.url());
          if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) {
            writes.push(req.method());
            return route.abort();
          }
          if (url.pathname.startsWith('/api/market-data/rule-monitor')) {
            const response = await route.fetch({
              url: (await app.getUrl()) + url.pathname + url.search,
            });
            return route.fulfill({ response });
          }
          return route.continue();
        });
        try {
          await page.goto('http://localhost:5173/market-data?section=monitor');
          const row = page
            .locator('section[aria-label="收费资料更新监测"] tbody tr')
            .filter({ hasText: '受控收费资料' });
          await row.getByRole('button', { name: '查看版本（2）' }).click();
          const sheet = page.getByRole('dialog', { name: '资料版本记录' });
          await sheet.getByText('相对比较基准，新增 1 行，删除 1 行。', { exact: true }).waitFor();
          assert(
            (await sheet.locator('[aria-label="正文差异"]').textContent()).includes('收费比例0.1%'),
          );
          await page.screenshot({ path: `${output}/diff-${width}.png` });
          await sheet.getByRole('tab', { name: '正文快照', exact: true }).click();
          await sheet.locator('pre').filter({ hasText: '收费比例0.2%' }).waitFor();
          const overflow = await sheet.evaluate(
            (element) => element.scrollWidth > element.clientWidth,
          );
          assert.equal(overflow, false);
          assert.deepEqual(writes, []);
        } finally {
          await page.close();
        }
      }
      console.log(
        JSON.stringify({
          browserWidths: [1440, 1024, 768, 390],
          actualHttpChain: true,
          realWrites: 0,
        }),
      );
    } finally {
      await browser.close();
    }
  }
  console.log(
    JSON.stringify({
      versions: list.versions.length,
      snapshot: detail.snapshot.status,
      added: detail.comparison.added,
      removed: detail.comparison.removed,
      source:
        '受控 HTTP 响应，实际抓取解析、隔离 SQLite 重开、DSA HTTP、Nest Market HTTP 与 API Client',
    }),
  );
} finally {
  if (app) await app.close();
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
}

const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const origin = process.env.FUND_REFERENCE_QA_BASE_URL || 'http://localhost:5173';
const output = process.env.FUND_REFERENCE_QA_OUTPUT || '/tmp/fund-nav-reference-qa';
mkdirSync(output, { recursive: true });

async function plotBox(root) {
  return root.locator('canvas').evaluateAll((canvases) => canvases.map((canvas) => canvas.getBoundingClientRect().toJSON())
    .sort((a, b) => b.width * b.height - a.width * a.height)[0]);
}
async function point(page, root, fraction) {
  await root.locator('canvas').first().scrollIntoViewIfNeeded();
  const box = await plotBox(root);
  await page.mouse.click(box.x + box.width * fraction, box.y + box.height * 0.5);
}
async function measure(page, root, from, to) {
  const button = page.getByRole('button', { name: '区间测量', exact: true });
  if (await button.getAttribute('aria-pressed') === 'true') await button.click();
  await button.click();
  await page.waitForTimeout(550);
  await point(page, root, from);
  await page.getByText('请选择净值区间终点；Esc 可取消。', { exact: true }).waitFor();
  await page.waitForTimeout(550);
  await point(page, root, to);
  await page.getByLabel('净值区间测量结果', { exact: true }).waitFor();
}
async function tradePixel(root) {
  return root.evaluate((root) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--color-market-down)';
    root.append(probe);
    const color = getComputedStyle(probe).color.match(/\d+/g).map(Number);
    probe.remove();
    for (const canvas of root.querySelectorAll('canvas')) {
      if (!canvas.width || !canvas.height) continue;
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      for (let y = canvas.height - 1; y >= 0; y--) for (let x = 0; x < canvas.width; x++) {
        const at = (y * canvas.width + x) * 4;
        if (data[at] === color[0] && data[at + 1] === color[1] && data[at + 2] === color[2] && data[at + 3] > 200) {
          const box = canvas.getBoundingClientRect();
          return { x: box.x + (x + 0.5) * box.width / canvas.width, y: box.y + (y + 0.5) * box.height / canvas.height };
        }
      }
    }
    return null;
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.FUND_REFERENCE_CHROMIUM_EXECUTABLE });
  const results = [];
  try {
    for (const width of (process.env.FUND_REFERENCE_QA_WIDTHS || '1440,1024,768,390').split(',').map(Number)) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const errors = [], reads = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(() => {
        window.measureRects = [];
        window.costLabels = [];
        const fill = CanvasRenderingContext2D.prototype.fillRect;
        CanvasRenderingContext2D.prototype.fillRect = function(x, y, w, h) {
          if (this.fillStyle === 'rgba(37, 99, 235, 0.16)') window.measureRects.push({ x, y, w, h, height: this.canvas.height / devicePixelRatio });
          return fill.call(this, x, y, w, h);
        };
        const text = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function(value, ...args) {
          if (String(value).includes('持仓单位成本')) window.costLabels.push(String(value));
          return text.call(this, value, ...args);
        };
      });
      await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
        assert.equal(route.request().method(), 'GET');
        const url = new URL(route.request().url()), input = Object.fromEntries(url.searchParams);
        reads.push(url.pathname);
        if (url.pathname.endsWith('/pnl-series')) return route.fulfill({ json: {
          mode: input.mode, accountId: input.accountId, symbol: input.symbol, asOf: input.asOf,
          currency: 'CNY', range: 'ALL', basis: 'REALIZED_PLUS_UNREALIZED', historyStart: '2026-10-25T08:00:00Z',
          truncated: false, currentRealizedPnl: 0, points: [
            { at: '2026-10-25T08:00:00Z', value: 2, unrealizedPnl: 2, realizedPnl: 0, sourceSnapshotId: 's1', reason: null },
          ],
        } });
        assert(url.pathname.endsWith('/trades/chart'));
        const record = (id, side, day) => ({ id, eventId: `event-${id}`, factId: `fact-${id}`, side,
          tradingDate: day, occurredAt: `${day}T02:00:00Z`, timePrecision: 'DATE', currency: 'CNY', price: '1.2', quantity: '10' });
        return route.fulfill({ json: { ...input, version: 'trade-chart-v1', ledgerRevision: '1', projectionGeneration: '1',
          generatedAt: '2026-11-08T00:00:00Z', status: 'ready',
          markers: [record('b1', 'buy', '2026-10-28'), record('s1', 'sell', '2026-11-02')],
          omittedCount: 0, unplacedCount: 0, unplacedCountScope: 'symbol-all-dates' } });
      });
      await page.goto(`${origin}/test/browser-fund-nav-trades.html`);
      await page.getByRole('button', { name: '打开基金行情', exact: true }).click();
      await page.getByRole('button', { name: '查看成交记录', exact: true }).waitFor();
      const root = page.locator('[data-market-nav-chart]');
      assert.equal(await page.getByRole('button', { name: '成本参考', exact: true }).isVisible(), false);
      await page.getByText('参考与测量', { exact: true }).click();
      assert.equal(await page.getByRole('button', { name: '成本参考', exact: true }).isEnabled(), true);
      const button = page.getByRole('button', { name: '区间测量', exact: true });
      const prompt = page.getByRole('status').filter({ hasText: /请选择净值区间|所选日期没有正式净值/ });
      await button.click();
      await prompt.waitFor();
      await button.click();
      await prompt.waitFor({ state: 'hidden' });
      await button.click();
      await page.waitForTimeout(550);
      await point(page, root, 0.4);
      await page.getByText('请选择净值区间终点；Esc 可取消。', { exact: true }).waitFor();
      await button.click();
      await prompt.waitFor({ state: 'hidden' });
      const before = reads.length;
      await page.getByRole('button', { name: '成本参考', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: '成本参考', exact: true, includeHidden: true }).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.getByLabel('当前持仓单位成本参考', { exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: '清除参考', exact: true }).count(), 0);
      await page.waitForFunction(() => window.costLabels.length > 0);
      await measure(page, root, 0.3, 0.7);
      await page.waitForFunction(() => window.measureRects.length > 0);
      const rect = await page.evaluate(() => window.measureRects.at(-1));
      assert.equal(rect.y, 0);
      assert(Math.abs(rect.h - rect.height) < 1);
      assert.equal(reads.length, before, '成本和测量不新增读取');
      await page.screenshot({ path: `${output}/references-${width}.png`, fullPage: true, animations: 'disabled' });
      await page.waitForTimeout(550);
      const completedMarker = await tradePixel(root);
      assert(completedMarker);
      await page.mouse.click(completedMarker.x, completedMarker.y);
      const completedDetail = page.getByRole('dialog', { name: '成交详情', exact: true });
      await completedDetail.waitFor();
      await page.keyboard.press('Escape');
      await completedDetail.waitFor({ state: 'hidden' });
      assert.equal(await button.getAttribute('aria-pressed'), 'true');

      await page.getByRole('button', { name: '成本参考', exact: true }).click();
      assert.equal(await button.getAttribute('aria-pressed'), 'true');
      await button.click();
      await prompt.waitFor({ state: 'hidden' });
      await page.getByLabel('净值区间测量结果', { exact: true }).waitFor({ state: 'hidden' });
      await measure(page, root, 0.3, 0.7);
      await page.keyboard.press('Escape');
      await prompt.waitFor({ state: 'hidden' });
      await page.getByLabel('净值区间测量结果', { exact: true }).waitFor({ state: 'hidden' });
      await page.screenshot({ path: `${output}/cancelled-${width}.png`, fullPage: true, animations: 'disabled' });
      assert.equal(await page.getByRole('button', { name: '成本参考', exact: true, includeHidden: true }).getAttribute('aria-pressed'), 'false');
      await page.getByRole('button', { name: '区间测量', exact: true }).click();
      await page.waitForTimeout(550);
      await point(page, root, 0.4);
      await page.getByText('请选择净值区间终点；Esc 可取消。', { exact: true }).waitFor();
      if (width === 1440) {
        await page.getByRole('combobox', { name: '更多区间', exact: true }).click();
        await page.getByRole('option', { name: '自定义区间', exact: true }).click();
        const dates = page.getByRole('dialog', { name: '自定义区间', exact: true });
        await dates.getByLabel('开始日期', { exact: true }).focus();
        await page.keyboard.press('Escape');
        await dates.waitFor({ state: 'hidden' });
        assert.equal(await page.getByRole('button', { name: '区间测量', exact: true }).getAttribute('aria-pressed'), 'true');
      }
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('button', { name: '区间测量', exact: true }).getAttribute('aria-pressed'), 'false');
      assert(await page.getByRole('dialog', { name: '基金净值历史', exact: true }).isVisible());
      await page.getByRole('button', { name: '区间测量', exact: true }).click();
      await page.waitForTimeout(550);
      const marker = await tradePixel(root);
      assert(marker);
      await page.mouse.click(marker.x, marker.y);
      assert.equal(await page.getByRole('dialog', { name: '成交详情', exact: true }).count(), 0);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(550);
      const restored = await tradePixel(root);
      await page.mouse.click(restored.x, restored.y);
      const detail = page.getByRole('dialog', { name: '成交详情', exact: true });
      await detail.waitFor();
      await page.keyboard.press('Escape');
      await detail.waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: '成本参考', exact: true }).click();
      await page.getByRole('button', { name: '切换账户', exact: true }).click();
      await page.getByRole('button', { name: '查看成交记录', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: '成本参考', exact: true, includeHidden: true }).getAttribute('aria-pressed'), 'false');
      assert.equal(await page.getByLabel('净值区间测量结果', { exact: true }).count(), 0);
      await page.getByText('参考与测量', { exact: true }).click();
      await page.getByRole('button', { name: '成本参考', exact: true }).click();
      await page.getByRole('button', { name: '切换账户类型', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: '成本参考', exact: true, includeHidden: true }).getAttribute('aria-pressed'), 'false');
      if (width === 1440) {
        await page.getByRole('button', { name: '切换目录入口', exact: true }).click();
        await page.getByText('参考与测量', { exact: true }).click();
        assert.equal(await page.getByRole('button', { name: '成本参考', exact: true }).isDisabled(), true);
        await page.getByRole('button', { name: '成本参考说明', exact: true }).click();
        await page.locator('[data-slot="hover-card-content"]').getByText('请从具体账户的基金持仓打开详情，才能查看成本参考。', { exact: true }).waitFor();
        await page.keyboard.press('Escape');
        await page.locator('[data-slot="hover-card-content"]').waitFor({ state: 'hidden' });
        await measure(page, root, 0.7, 0.3);
        assert((await page.getByLabel('净值区间测量结果', { exact: true }).innerText()).includes('涨跌幅 +'));
        await measure(page, root, 0.5, 0.5);
        assert((await page.getByLabel('净值区间测量结果', { exact: true }).innerText()).includes('1 条净值记录'));
        await page.screenshot({ path: `${output}/catalog-single-point-${width}.png`, fullPage: true, animations: 'disabled' });
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []);
      results.push({ width, costVisible: true, fullHeight: true, noAdditionalReads: true, cancel: true,
        markerPriority: true, tradeDetails: true, accountIsolation: true, modeIsolation: true, overflow: false });
      console.log(JSON.stringify(results.at(-1)));
      await context.close();
    }
  } finally {
    writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });

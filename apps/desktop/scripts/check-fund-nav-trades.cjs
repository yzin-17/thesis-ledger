const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const origin = process.env.FUND_NAV_TRADES_QA_BASE_URL || 'http://127.0.0.1:5173';
const output = process.env.FUND_NAV_TRADES_QA_OUTPUT || '/tmp/fund-nav-trades-qa';
mkdirSync(output, { recursive: true });

const record = (id, side, date, quantity, extra = {}) => ({
  id,
  eventId: `event-${id}`,
  factId: `fact-${id}`,
  side,
  tradingDate: date,
  occurredAt: date + 'T02:00:00Z',
  timePrecision: 'INSTANT',
  currency: 'CNY',
  price: '1.123456789012345678',
  quantity,
  ...extra,
});
const records = [
  record('b1', 'buy', '2026-10-28', '10.123456789012345678'),
  record('b2', 'buy', '2026-10-28', '0.000000000000000001'),
  record('s1', 'sell', '2026-11-02', '1.000000000000000001', {
    eventId: 'sell-event',
    factId: 'sell-fact',
    timePrecision: 'DATE',
  }),
  record('s2', 'sell', '2026-11-02', '2.000000000000000009', {
    eventId: 'sell-event',
    factId: 'sell-fact',
    timePrecision: 'DATE',
  }),
  record('missing', 'buy', '2026-11-03', '1'),
];

async function clickSellMarker(page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const pixel = await page.locator('[data-market-nav-chart]').evaluate((root) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--color-market-down)';
    root.append(probe);
    const color = getComputedStyle(probe).color.match(/\d+/g).map(Number);
    probe.remove();
    for (const canvas of root.querySelectorAll('canvas')) {
      const context = canvas.getContext('2d');
      if (!context || !canvas.width || !canvas.height) continue;
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let y = canvas.height - 1; y >= 0; y--)
        for (let x = 0; x < canvas.width; x++) {
          const at = (y * canvas.width + x) * 4;
          if (data[at] === color[0] && data[at + 1] === color[1] && data[at + 2] === color[2] && data[at + 3] > 200) {
            const box = canvas.getBoundingClientRect();
            return {
              x: box.x + ((x + 0.5) * box.width) / canvas.width,
              y: box.y + ((y + 0.5) * box.height) / canvas.height,
            };
          }
        }
    }
    return null;
  });
  assert(pixel, '净值序列必须真实绘出卖出箭头或文字');
  await page.mouse.move(pixel.x, pixel.y);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.mouse.click(pixel.x, pixel.y);
  await page.getByRole('dialog', { name: '成交详情', exact: true }).waitFor();
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.FUND_NAV_TRADES_CHROMIUM_EXECUTABLE,
  });
  const results = [];
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        reducedMotion: 'reduce',
        timezoneId: 'Asia/Shanghai',
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const reads = [],
        errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      let fail = false,
        hold = false,
        release;
      await page.route(
        (url) => url.pathname.startsWith('/api/'),
        async (route) => {
          assert.equal(route.request().method(), 'GET');
          const url = new URL(route.request().url()),
            input = Object.fromEntries(url.searchParams);
          if (url.pathname.endsWith('/pnl-series'))
            return route.fulfill({
              json: {
                mode: input.mode,
                accountId: input.accountId,
                symbol: input.symbol,
                asOf: input.asOf,
                currency: 'CNY',
                range: 'ALL',
                basis: 'REALIZED_PLUS_UNREALIZED',
                historyStart: '2026-10-25T08:00:00Z',
                truncated: false,
                currentRealizedPnl: 0,
                points: [
                  {
                    at: '2026-10-25T08:00:00Z',
                    value: 2,
                    unrealizedPnl: 2,
                    realizedPnl: 0,
                    sourceSnapshotId: 's1',
                    reason: null,
                  },
                  {
                    at: '2026-11-02T08:00:00Z',
                    value: 8,
                    unrealizedPnl: 8,
                    realizedPnl: 0,
                    sourceSnapshotId: 's2',
                    reason: null,
                  },
                ],
              },
            });
          assert(url.pathname.endsWith('/trades/chart'), '受控验收只读取成交与盈亏');
          reads.push(input);
          if (hold)
            await new Promise((resolve) => {
              release = resolve;
            });
          if (fail) return route.fulfill({ status: 503, json: { message: '受控读取失败' } });
          const markers =
            input.accountId.startsWith('1') && input.mode === 'actual'
              ? records
              : [record('other', 'buy', '2026-10-28', '99')];
          await route.fulfill({
            json: {
              ...input,
              version: 'trade-chart-v1',
              ledgerRevision: '1',
              projectionGeneration: '1',
              generatedAt: '2026-11-08T00:00:00Z',
              status: 'ready',
              markers,
              omittedCount: 0,
              unplacedCount: 1,
              unplacedCountScope: 'symbol-all-dates',
            },
          });
        },
      );
      await page.goto(origin + '/test/browser-fund-nav-trades.html');
      await page.getByRole('button', { name: '打开基金行情', exact: true }).click();
      await page.getByRole('button', { name: '查看成交记录', exact: true }).waitFor();
      assert(await page.getByText(/1条成交当天无净值/).isVisible());
      for (const scheme of ['red-up', 'green-up']) {
        await page.evaluate((scheme) => {
          const style = document.documentElement.style;
          style.setProperty('--color-market-up', scheme === 'red-up' ? '#c7393c' : '#2f7a66');
          style.setProperty('--color-market-down', scheme === 'red-up' ? '#2f7a66' : '#c7393c');
        }, scheme);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const colors = await page.locator('[data-market-nav-chart]').evaluate((root) => {
          const counts = { red: 0, green: 0 };
          for (const canvas of root.querySelectorAll('canvas')) {
            const context = canvas.getContext('2d');
            if (!context || !canvas.width || !canvas.height) continue;
            const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
            for (let at = 0; at < data.length; at += 4) {
              if (data[at] === 199 && data[at + 1] === 57 && data[at + 2] === 60 && data[at + 3] > 200) counts.red++;
              if (data[at] === 47 && data[at + 1] === 122 && data[at + 2] === 102 && data[at + 3] > 200) counts.green++;
            }
          }
          return counts;
        });
        assert(colors.red > 0 && colors.green > 0, '买卖标记必须随涨跌配色绘制');
        await page.screenshot({ path: join(output, `colors-${scheme}-${width}.png`), animations: 'disabled' });
      }
      await page.evaluate(() => {
        document.documentElement.style.setProperty('--color-market-up', '#c7393c');
        document.documentElement.style.setProperty('--color-market-down', '#2f7a66');
      });
      await page.screenshot({ path: join(output, `chart-${width}.png`), animations: 'disabled' });
      await clickSellMarker(page);
      const detail = page.getByRole('dialog', { name: '成交详情', exact: true });
      await detail.evaluate(async (element) => {
        while (getComputedStyle(element).opacity !== '1') {
          await new Promise(requestAnimationFrame);
        }
        const box = element.getBoundingClientRect();
        if (
          !element.contains(
            document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
          )
        ) {
          throw new Error('成交详情必须显示在行情弹窗上方');
        }
      });
      assert((await detail.textContent()).includes('3.00000000000000001'));
      assert((await detail.textContent()).includes('1.123456789012345678 CNY'));
      assert((await detail.textContent()).includes('按日记录'));
      const box = await detail.boundingBox();
      assert(
        box.x >= 0 && box.x + box.width <= width + 1 && box.y >= 0 && box.y + box.height <= 1001,
      );
      await page.screenshot({ path: join(output, `detail-${width}.png`), animations: 'disabled' });
      await page.keyboard.press('Escape');
      await detail.waitFor({ state: 'hidden' });
      assert(await page.getByRole('dialog', { name: '基金净值历史', exact: true }).isVisible());
      await page.getByRole('button', { name: '一月', exact: true }).click();
      await page.getByRole('button', { name: '重置', exact: true }).click();
      // Lightweight Charts 会在 500ms 双击窗口内吞掉第二次图表点击。
      await page.waitForTimeout(510);
      const chartBox = await page.locator('[data-market-nav-chart]').boundingBox();
      await page
        .locator('[data-market-nav-chart]')
        .click({ position: { x: chartBox.width * 0.4, y: chartBox.height * 0.5 } });
      await page.getByText(/已锁定/).waitFor();
      await page.getByRole('button', { name: '查看成交记录', exact: true }).click();
      const menu = page.getByRole('menu');
      await menu.waitFor();
      const menuBox = await menu.boundingBox();
      assert(menuBox.x >= 0 && menuBox.x + menuBox.width <= width + 1);
      assert(menuBox.y >= 0 && menuBox.y + menuBox.height <= 1001);
      await page.screenshot({ path: join(output, `records-${width}.png`), animations: 'disabled' });
      await page.keyboard.press('Escape');
      await menu.waitFor({ state: 'hidden' });
      assert(await page.getByRole('dialog', { name: '基金净值历史', exact: true }).isVisible());
      await page.getByRole('button', { name: '查看成交记录', exact: true }).press('ArrowDown');
      const buy = page.getByRole('menuitem', { name: '2026-10-28 买入 · 2笔', exact: true });
      await buy.focus();
      await page.keyboard.press('Enter');
      await detail.waitFor();
      assert((await detail.textContent()).includes('10.123456789012345678'));
      assert((await detail.textContent()).includes('0.000000000000000001'));
      await page.keyboard.press('Escape');
      await detail.waitFor({ state: 'hidden' });
      assert.equal(await page.getByText(/已锁定/).count(), 0);
      hold = true;
      await page.getByRole('button', { name: '刷新成交', exact: true }).click();
      await page.getByRole('status', { name: '正在读取净值图数据', exact: true }).waitFor();
      assert.equal(
        await page.locator('[data-market-nav-chart] [data-slot=list-refresh]').count(),
        1,
      );
      assert(await page.getByRole('button', { name: '查看成交记录', exact: true }).isVisible());
      fail = true;
      hold = false;
      release();
      await page.getByText('成交读取失败，保留上次买卖点。', { exact: true }).waitFor();
      fail = false;
      await page.getByRole('button', { name: '重试读取成交', exact: true }).click();
      await page
        .getByText('成交读取失败，保留上次买卖点。', { exact: true })
        .waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: '切换账户', exact: true }).click();
      await page.getByRole('button', { name: '查看成交记录', exact: true }).click();
      await page.getByRole('menuitem', { name: '2026-10-28 买入 · 1笔', exact: true }).click();
      await detail.waitFor();
      assert((await detail.textContent()).includes('验证账户乙'));
      assert((await detail.textContent()).includes('99'));
      assert(!(await detail.textContent()).includes('验证账户甲'));
      await page.keyboard.press('Escape');
      await detail.waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: '切换账户类型', exact: true }).click();
      await page.getByRole('button', { name: '查看成交记录', exact: true }).click();
      await page.getByRole('menuitem', { name: '2026-10-28 买入 · 1笔', exact: true }).click();
      await detail.waitFor();
      assert((await detail.textContent()).includes('模拟账户'));
      await page.keyboard.press('Escape');
      await detail.waitFor({ state: 'hidden' });
      const before = reads.length;
      await page.getByRole('button', { name: '切换目录入口', exact: true }).click();
      assert.equal(
        await page.getByRole('button', { name: '查看成交记录', exact: true }).count(),
        0,
      );
      assert.equal(reads.length, before);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []);
      results.push({
        width,
        canvasMarkerClick: true,
        exactDetails: true,
        keyboard: true,
        dropdown: true,
        nestedClose: true,
        refreshRetry: true,
        scopeIsolation: true,
        noOverflow: true,
        tradeReads: reads.length,
      });
      console.log(JSON.stringify(results.at(-1)));
      await context.close();
    }
  } finally {
    writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2));
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

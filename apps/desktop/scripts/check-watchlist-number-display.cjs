const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const samples = require('../test/watchlist-number-samples.json');
const scenarios = [
  ...samples.map((s) => ({ name: s.name, expected: s.expected })),
  { name: 'nav', expected: { value: '1E-7', change: '—', changeAmount: '—', amplitude: '—' } },
  { name: 'unavailable', expected: { value: '—', change: '—', changeAmount: '—', amplitude: '—' } },
];
const origin = process.env.WATCHLIST_NUMBER_QA_BASE_URL || 'http://127.0.0.1:5181';
const output = process.env.WATCHLIST_NUMBER_QA_OUTPUT || '/tmp/watchlist-number-qa';
const id = '00000000-0000-4000-8000-000000000001';
mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.WATCHLIST_NUMBER_CHROMIUM_EXECUTABLE,
    headless: true,
  });
  const results = [],
    errors = [],
    requests = [];
  let activePage, activeCase;
  try {
    for (const platform of ['desktop', 'mobile'])
      for (const width of [1440, 1024, 768, 390])
        for (const { name, expected } of scenarios) {
          activeCase = { platform, width, name };
          const context = await browser.newContext({
              viewport: { width, height: 1000 },
              timezoneId: 'Asia/Shanghai',
            }),
            page = await context.newPage();
          activePage = page;
          page.setDefaultTimeout(10000);
          page.on('pageerror', (e) => errors.push({ case: activeCase, message: e.message }));
          await page.route('**/*', (route) => {
            const url = new URL(route.request().url());
            if (url.origin !== new URL(origin).origin || url.pathname.startsWith('/api/')) {
              requests.push(url.origin + url.pathname);
              return route.abort();
            }
            return route.continue();
          });
          await page.goto(
            origin +
              '/test/browser-' +
              (platform === 'mobile' ? 'mobile-' : '') +
              'watchlist-number.html?case=' +
              name,
          );
          await page.waitForFunction(
            (name) => document.documentElement.dataset.watchlistReady === name,
            name,
          );
          const raw = await page.evaluate(() => document.documentElement.dataset.watchlistRaw),
            snapshot = JSON.parse(raw);
          assert.equal(snapshot.page.items[0].displayName, '精度验收标的');
          assert.equal(snapshot.prices[0].itemId, id);
          const symbol = name === 'nav' ? '000001.OF' : '000001.SZ';
          if (platform === 'desktop') {
            const table = page.getByRole('table', { name: '自选标的' }),
              row = table.locator('tbody tr').first(),
              cells = row.locator('td');
            assert.equal((await cells.nth(1).innerText()).includes(expected.value), true);
            await page.evaluate(() => document.fonts.ready);
            const clippedPrice = await cells.nth(1).evaluate((el) => {
              const box = el.getBoundingClientRect();
              const range = document.createRange();
              range.selectNodeContents(el);
              return [...range.getClientRects()]
                .filter(
                  (r) =>
                    r.width > 0 &&
                    r.height > 0 &&
                    (r.left < box.left - 1 ||
                      r.right > box.right + 1 ||
                      r.top < box.top - 3 ||
                      r.bottom > box.bottom + 3),
                )
                .map((r) => r.toJSON());
            });
            assert.deepEqual(clippedPrice, []);
            const changes = await cells.nth(2).innerText();
            assert.equal(changes.includes(expected.change), true);
            assert.equal(changes.includes(expected.changeAmount), true);
            const range = await cells.nth(4).innerText();
            assert.equal(range.includes('振幅 ' + expected.amplitude), true);
            if (!['nav', 'unavailable'].includes(name)) {
              assert.equal(
                range.includes('今开 ' + expected.open + ' · 前收 ' + expected.previousClose),
                true,
              );
              assert.equal(await row.locator('svg[role="img"]').count(), 1);
            } else assert.equal(await row.locator('svg[role="img"]').count(), 0);
            await cells.nth(0).getByRole('button').click();
            assert.equal(
              await page.evaluate(() => document.documentElement.dataset.watchlistSelected),
              id,
            );
            const menu = page.getByRole('button', { name: '精度验收标的的操作', exact: true });
            await menu.click();
            await page
              .getByRole('menuitem', { name: '移出自选', exact: true })
              .waitFor({ state: 'visible' });
            await page.keyboard.press('Escape');
            await page
              .getByRole('menuitem', { name: '移出自选', exact: true })
              .waitFor({ state: 'hidden' });
            assert.equal(await menu.evaluate((el) => document.activeElement === el), true);
            const oldRow = await row.elementHandle();
            await page.getByRole('button', { name: '受控开始刷新', exact: true }).click();
            await page
              .getByRole('status', { name: '正在刷新自选', exact: true })
              .waitFor({ state: 'visible' });
            assert.equal(await oldRow.evaluate((el) => el.isConnected), true);
            await page.getByRole('button', { name: '受控结束刷新', exact: true }).click();
            await page
              .getByRole('status', { name: '正在刷新自选', exact: true })
              .waitFor({ state: 'hidden' });
            assert.equal(await oldRow.evaluate((el) => el.isConnected), true);
            const contained = await table.evaluate((el) => {
              const parent = el.parentElement;
              return {
                table: el.getBoundingClientRect().width,
                container: parent.getBoundingClientRect().width,
                scroll: parent.scrollWidth,
                client: parent.clientWidth,
                overflow: getComputedStyle(parent).overflowX,
              };
            });
            if (width === 1024 || width === 768) {
              assert.ok(contained.scroll > contained.client);
              assert.ok(['auto', 'scroll'].includes(contained.overflow));
            }
          } else {
            await page
              .getByText(symbol + ' ' + expected.value + ' ' + expected.change, { exact: true })
              .waitFor({ state: 'visible' });
            await page.getByRole('button', { name: '管理', exact: true }).click();
            await page
              .getByRole('button', { name: '移出自选', exact: true })
              .waitFor({ state: 'visible' });
            await page.getByRole('button', { name: '管理', exact: true }).click();
            await page
              .getByRole('button', { name: '移出自选', exact: true })
              .waitFor({ state: 'hidden' });
            await page.getByRole('button', { name: '行情详情', exact: true }).click();
            const navigation = await page.evaluate(() =>
              JSON.parse(document.documentElement.dataset.watchlistNavigation),
            );
            assert.equal(navigation.name, 'MarketDetail');
            assert.equal(navigation.params.instrument.symbol, symbol);
            assert.equal(navigation.params.instrument.name, '精度验收标的');
            assert.equal(navigation.params.instrument.instrumentId, id);
          }
          const body = await page.locator('body').innerText();
          assert.equal(/NaN|Infinity/.test(body), false);
          if (name === 'ordinary') {
            for (const label of [
              '休市 · 最近时段快照',
              '刷新失败，沿用上次报价',
              '来源快照，非官方收盘价',
              '腾讯财经',
            ])
              assert.equal(body.includes(label), true);
          }
          if (name === 'tiny') {
            for (const label of ['未覆盖最近交易时段', '请求冷却中，沿用上次报价', '腾讯财经'])
              assert.equal(body.includes(label), true);
          }
          if (name === 'near-positive') assert.equal(body.includes('行情时间未知'), true);
          if (name === 'nav') {
            assert.equal(body.includes('正式净值'), true);
            assert.equal(body.includes('2026-11-06'), true);
            assert.equal(body.includes('CNY'), false);
          }
          if (name === 'unavailable') assert.equal(body.includes('行情来源不符合条件'), true);
          assert.equal(body.includes('实际持有'), true);
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          );
          assert.equal(overflow, false);
          assert.equal(
            await page.evaluate(() => document.documentElement.dataset.watchlistRaw),
            raw,
          );
          const screenshot = join(output, platform + '-' + name + '-' + width + '.png');
          await page.screenshot({ path: screenshot, fullPage: true });
          results.push({ ...activeCase, passed: true, overflow, screenshot });
          await context.close();
        }
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    writeFileSync(
      join(output, 'results.json'),
      JSON.stringify(
        { results, errors, requests, realBusinessWrites: 0, nativeCompile: false },
        null,
        2,
      ),
    );
    process.stdout.write(
      JSON.stringify({ cases: results.length, errors: errors.length, requests: requests.length }) +
        '\n',
    );
  } catch (error) {
    writeFileSync(
      join(output, 'failure.json'),
      JSON.stringify({ activeCase, results, errors, requests, error: error.stack }, null, 2),
    );
    if (activePage && !activePage.isClosed())
      await activePage
        .screenshot({ path: join(output, 'failure.png'), fullPage: true })
        .catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  process.stderr.write(error.stack + '\n');
  process.exitCode = 1;
});

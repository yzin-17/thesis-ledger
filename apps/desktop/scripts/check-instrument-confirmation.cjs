const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const output = process.env.INSTRUMENT_CONFIRM_QA_OUTPUT || '/tmp/instrument-confirm-qa';
const origin = process.env.INSTRUMENT_CONFIRM_QA_URL || 'http://localhost:5173';
mkdirSync(output, { recursive: true });
const id = '11111111-1111-4111-8111-111111111111';
const item = { id, symbol: '600036.SH', canonicalCode: '600036', displayName: '招商银行', market: 'SH',
  instrumentType: 'STOCK', confirmable: true, confirmed: false, disabledReason: null, active: true, generation: 1 };

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  let activePage;
  const results = [];
  try {
    for (const width of [1440,1024,768,390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      activePage = page;
      const errors = [], forbidden = [];
      let saved = false, writes = 0, mode = 'failed', finish;
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
        const request = route.request(), path = new URL(request.url()).pathname;
        if (path.endsWith('/instruments/search')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify([
          { ...item, confirmed: saved },
          { ...item, id: '22222222-2222-4222-8222-222222222222', displayName: '已确认样本', symbol: '600000.SH', confirmed: true },
          { ...item, id: '33333333-3333-4333-8333-333333333333', displayName: '港股样本', symbol: '03968.HK', market: 'HK', confirmable: false,
            disabledReason: 'unsupported_market' },
        ]) });
        if (path.endsWith(`/instruments/${id}/confirm`) && request.method() === 'POST') {
          writes += 1;
          if (mode === 'failed') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '受控确认失败' }) });
          if (mode === 'pending') await new Promise((resolve) => { finish = resolve; });
          saved = true;
          return route.fulfill({ contentType: 'application/json', body: '{}' });
        }
        if (request.method() === 'GET') return route.continue();
        forbidden.push({ method: request.method(), path });
        return route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
      });
      await page.goto(origin + '/market-data');
      await page.getByRole('tab', { name: '标的目录', exact: true }).click();
      const input = page.getByRole('textbox', { name: '搜索已同步标的', exact: true });
      await input.fill('招商银行');
      await page.getByRole('button', { name: '搜索', exact: true }).click();
      const row = page.getByText('招商银行', { exact: true }).locator('../..');
      const confirmed = page.getByText('已确认样本', { exact: true }).locator('../..');
      const unsupported = page.getByText('港股样本', { exact: true }).locator('../..');
      const confirm = row.getByRole('button', { name: '确认标的', exact: true });
      await confirm.waitFor();
      assert(await confirmed.getByRole('button', { name: '已确认', exact: true }).isDisabled());
      assert(await unsupported.getByRole('button', { name: '不支持关联', exact: true }).isDisabled());
      await confirm.click();
      await page.getByText('服务暂时无法完成本次操作，请稍后重试。', { exact: true }).waitFor();
      assert(await confirm.isEnabled());
      assert.equal(writes,1);
      assert.equal(saved,false);
      mode = 'pending';
      await confirm.click();
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some((node) => node.textContent.trim() === '确认标的' && node.disabled));
      assert(await confirm.isDisabled());
      finish();
      await row.getByRole('button', { name: '已确认', exact: true }).waitFor();
      assert(await row.getByRole('button', { name: '已确认', exact: true }).isDisabled());
      assert.equal(writes,2);
      await input.fill('600036');
      await page.getByRole('button', { name: '搜索', exact: true }).click();
      await row.getByRole('button', { name: '已确认', exact: true }).waitFor();
      await page.reload();
      await page.getByRole('tab', { name: '标的目录', exact: true }).click();
      await input.fill('招商银行');
      await page.getByRole('button', { name: '搜索', exact: true }).click();
      await row.getByRole('button', { name: '已确认', exact: true }).waitFor();
      await input.focus();
      const layout = await page.evaluate(() => ({ width: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth, buttons: [...document.querySelectorAll('[data-slot="list-refresh-region"] button')]
          .filter((node) => node.getBoundingClientRect().width).map((node) => {
            const r = node.getBoundingClientRect(); return { left: r.left, right: r.right };
          }) }));
      assert(layout.scroll <= width && layout.buttons.every((r) => r.left >= 0 && r.right <= width), JSON.stringify(layout));
      if (width === 390) await unsupported.evaluate((element) => element.scrollIntoView({ block: 'center' }));
      await page.screenshot({ path: `${output}/confirmed-${width}.png`, fullPage: true });
      assert.deepEqual(errors,[]); assert.deepEqual(forbidden,[]);
      results.push({ width, controlledWrites: writes, realWrites: 0, errors, layout, success: true, failure: true, reopened: true });
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.close(); activePage = undefined;
    }
    writeFileSync(`${output}/results.json`, JSON.stringify(results,null,2));
    console.log(JSON.stringify(results));
  } catch (error) {
    if (activePage) await activePage.screenshot({ path: `${output}/failure.png` }).catch(() => {});
    throw error;
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

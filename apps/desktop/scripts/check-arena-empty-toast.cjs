const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdirSync, writeFileSync } = require('node:fs');
const origin = process.env.ARENA_TOAST_QA_BASE_URL || 'http://localhost:5173';
const output = process.env.ARENA_TOAST_QA_OUTPUT || '/tmp/arena-empty-toast-qa';
mkdirSync(output, { recursive: true });
const text = '暂无包含此标的的比赛';
async function settle(page) { await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function position(page, popup) {
  await settle(page);
  const notice = page.locator('[data-slot="toast"]').filter({ hasText: text });
  const a = await popup.boundingBox(), b = await notice.boundingBox();
  assert(Math.abs((b.x + b.width / 2) - (a.x + a.width / 2)) < 2, JSON.stringify({ a, b }));
  assert(Math.abs(b.y - a.y - 16) < 2, JSON.stringify({ a, b }));
  assert(b.x >= 0 && b.x + b.width <= page.viewportSize().width + 1);
  const clipping = await notice.evaluate((node) => {
    const parent = node.closest('[data-slot="toast-viewport"]');
    return { radius: parseFloat(getComputedStyle(node).borderTopLeftRadius), viewportRadius: parseFloat(getComputedStyle(parent).borderTopLeftRadius), overflowY: getComputedStyle(parent).overflowY, shadow: getComputedStyle(node).boxShadow };
  });
  assert(clipping.radius > 0 && clipping.viewportRadius === 0, JSON.stringify(clipping));
  assert.equal(clipping.overflowY, 'auto');
  const shadowColors = clipping.shadow.match(/rgba?\([^)]+\)/g) ?? [];
  assert(clipping.shadow === 'none' || shadowColors.length > 0 && shadowColors.every((color) => /^rgba\([^)]*,\s*0\)$/.test(color)), clipping.shadow);
  assert(await notice.evaluate((node) => !!node.closest('[data-slot="dialog-content"]')));
}
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ARENA_TOAST_CHROMIUM_EXECUTABLE });
  const results = [];
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      page.setDefaultTimeout(10000);
      const errors = [], reads = [];
      let fail = false, hold = false, held, onHeld;
      const holdNext = () => { hold = true; return new Promise((resolve) => { onHeld = resolve; }); };
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/src/shared/api/client.*', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export const getDesktopApiClient = () => window.arenaToastApi;' }));
      await page.route('**/test/arena-empty-read', (route) => {
        reads.push(route.request().url());
        if (hold) { held = route; onHeld?.(); onHeld = null; return; }
        return route.fulfill({ status: fail ? 503 : 200, json: [] });
      });
      await page.goto(`${origin}/test/browser-arena-empty-toast.html`);
      const popup = page.getByRole('dialog', { name: '模型 Toast 验证', exact: true });
      const model = popup.getByRole('button', { name: '模型模拟买卖点', exact: true });
      const notice = page.locator('[data-slot="toast"]').filter({ hasText: text });
      await model.waitFor(); assert.equal(reads.length, 0); assert.equal(await notice.count(), 0);
      const mb = await model.boundingBox(), sb = await popup.locator('summary').boundingBox(); assert(mb.x < sb.x); assert(Math.abs(mb.y - sb.y) < 1);
      await popup.getByRole('button', { name: '放大图表', exact: true }).click();
      await popup.getByRole('button', { name: '查看更早日期', exact: true }).click();
      await page.mouse.move(0, 0); await settle(page);
      const plot = popup.locator('[data-market-lightweight-chart]');
      const plotNode = await plot.elementHandle(), canvasNode = await plot.locator('canvas').first().elementHandle();
      const pixels = async () => createHash('sha256').update(await canvasNode.evaluate((node) => node.toDataURL())).digest('hex');
      const beforePlot = await plot.boundingBox(), beforePixels = await pixels();
      const requested = holdNext(); const started = Date.now(); await model.click(); await requested;
      assert.equal(await model.getAttribute('aria-pressed'), 'true');
      assert((await model.getAttribute('class')).includes('bg-primary'));
      assert(await plotNode.evaluate((node) => node.isConnected)); assert(await canvasNode.evaluate((node) => node.isConnected));
      hold = false; await held.fulfill({ json: [] }); held = null; await notice.waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll('button')].find((node) => node.textContent === '模型模拟买卖点')?.getAttribute('aria-pressed') === 'false');
      assert.equal(await popup.getByRole('button', { name: '模型模拟买卖点说明', exact: true }).count(), 0);
      assert.equal(await notice.count(), 1); const node = await notice.elementHandle();
      await position(page, popup); await page.mouse.move(0, 0); await settle(page);
      assert(await canvasNode.evaluate((node) => node.isConnected));
      assert.equal(await pixels(), beforePixels, '空结果操作必须保留缩放后的原生曲线');
      const afterPlot = await plot.boundingBox(); assert(Math.abs(afterPlot.y - beforePlot.y) < 1);
      await page.screenshot({ path: `${output}/toast-${width}.png`, animations: 'disabled' });
      // 再次点击仍只显示一条消息，保持当前 Toast 节点。
      await model.click(); await page.waitForTimeout(150);
      assert.equal(await notice.count(), 1); assert(await node.evaluate((node) => node.isConnected));
      await popup.getByRole('button', { name: '刷新比赛', exact: true }).click(); await page.waitForTimeout(150);
      assert.equal(await notice.count(), 1);
      await page.mouse.move(0, 0); await notice.waitFor({ state: 'hidden' });
      const elapsed = Date.now() - started; assert(elapsed >= 2800 && elapsed < 6500, `timeout ${elapsed}`);
      const inactiveReads = reads.length;
      await popup.getByRole('button', { name: '刷新比赛', exact: true }).click(); await page.waitForTimeout(200);
      assert.equal(await notice.count(), 0); assert.equal(reads.length, inactiveReads);
      await popup.getByRole('button', { name: '切换周期', exact: true }).click(); await page.waitForTimeout(150); assert.equal(await notice.count(), 0);
      await model.click(); await notice.waitFor(); await position(page, popup);
      await notice.locator('[data-slot="toast-close"]').click(); await notice.waitFor({ state: 'hidden' }); assert(await popup.isVisible());
      // 旧版记住的空图层恢复后静默关闭，第一下主动点击即可反馈。
      await page.evaluate(() => sessionStorage.setItem('arena-layer:local-workspace:600036.SH', 'open'));
      await page.reload(); await model.waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll('button')].find((node) => node.textContent === '模型模拟买卖点')?.getAttribute('aria-pressed') === 'false');
      assert.equal(await notice.count(), 0);
      await model.click(); await notice.waitFor(); await notice.locator('[data-slot="toast-close"]').click(); await notice.waitFor({ state: 'hidden' });
      await page.setViewportSize({ width, height: 700 });
      await popup.getByRole('button', { name: '全屏', exact: true }).click(); const full = page.locator('[data-slot="dialog-content"]').filter({ has: page.getByRole('button', { name: '退出全屏', exact: true }) });
      const fullModel = full.getByRole('button', { name: '模型模拟买卖点', exact: true }); await fullModel.waitFor();
      await page.waitForTimeout(150); assert.equal(await notice.count(), 0);
      const fullCanvas = await full.locator('[data-market-lightweight-chart] canvas').first().elementHandle();
      await fullModel.click(); await notice.waitFor(); assert(await fullCanvas.evaluate((node) => node.isConnected));
      const scroll = await full.evaluate((node) => { node.scrollTop = Math.min(40, node.scrollHeight - node.clientHeight); return node.scrollTop; });
      await position(page, full);
      await notice.locator('[data-slot="toast-close"]').click(); await notice.waitFor({ state: 'hidden' });
      await page.keyboard.press('Escape'); await full.waitFor({ state: 'hidden' }); await model.waitFor();
      await page.waitForTimeout(150); assert.equal(await notice.count(), 0);
      const late = holdNext(); await model.click(); await late; await model.click();
      hold = false; await held.fulfill({ json: [] }); held = null;
      await page.waitForTimeout(200); assert.equal(await notice.count(), 0);
      fail = true; await model.click(); await popup.getByText('模拟点位读取失败', { exact: true }).waitFor(); assert.equal(await notice.count(), 0);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); assert.deepEqual(errors, []);
      results.push({ width, firstClickFeedback: true, nativeCanvasPreserved: true, zoomPixelsUnchanged: true, emptyReturnsClosed: true, noShadow: true, roundedCornersUnclipped: true, modelFirst: true, automaticToast: true, elapsed, deduplicated: true, manualClose: true, restoredSilent: true, backgroundSilent: true, periodSilent: true, fullscreen: true, scroll, cancelledLateResult: true, errorDistinct: true, layoutStable: true });
      console.log(JSON.stringify(results.at(-1))); await page.close();
    }
  } finally { writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2)); await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

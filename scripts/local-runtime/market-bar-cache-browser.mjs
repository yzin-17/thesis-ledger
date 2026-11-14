import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const output = process.env.CACHE_QA_OUTPUT;
assert(output, '必须指定回执目录');
await mkdir(output, { recursive: true, mode: 0o700 });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const reports = [];
try {
  for (const width of [1440, 1024, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:5186/test/browser-minute-auto-refresh.html');
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await page.waitForFunction(() => window.minuteFixture?.chartSequence > 0);
    const chart = dialog.locator('canvas').first();
    await chart.waitFor({ state: 'visible' });
    const refresh = page.getByRole('button', { name: '刷新行情', exact: true });
    await page.evaluate(() => { window.minuteFixture.delay = 1200; });
    await refresh.click();
    const indicator = page.locator('[data-slot="list-refresh"][aria-label="正在读取行情图数据"]');
    await indicator.waitFor({ state: 'visible' });
    assert.equal(await indicator.count(), 1);
    assert(await chart.isVisible(), '刷新期间原图应保留');
    await page.screenshot({ path: join(output, `${width}-refresh.png`), fullPage: true });
    await indicator.waitFor({ state: 'hidden' });
    assert(await page.evaluate(() => window.minuteFixture.requests.some(r => r.refresh === true)));
    await page.evaluate(() => { window.minuteFixture.fail = true; });
    await refresh.click();
    await indicator.waitFor({ state: 'visible' });
    await indicator.waitFor({ state: 'hidden' });
    assert(await chart.isVisible(), '失败后原图应保留');
    await page.screenshot({ path: join(output, `${width}-failure.png`), fullPage: true });
    const before = await page.evaluate(() => window.minuteFixture.chartSequence);
    await page.evaluate(() => { window.minuteFixture.fail = false; window.minuteFixture.delay = 0; });
    await refresh.click();
    await page.waitForFunction(value => window.minuteFixture.chartSequence > value, before);
    const bounds = await dialog.boundingBox();
    assert(bounds && bounds.x >= -1 && bounds.x + bounds.width <= width + 1, '弹窗超出视口');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert(overflow <= 1, '页面横向溢出');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: '打开行情', exact: true }).click();
    await dialog.waitFor();
    assert.deepEqual(errors, []);
    reports.push({ width, retainedOnRefresh: true, oneChartSpinner: true, refreshFlag: true,
      retainedOnFailure: true, recovered: true, reopened: true, overflow });
    await page.close();
  }
  await writeFile(join(output, 'report.json'), JSON.stringify({ passed: true, controlled: true,
    providerPriceCalls: 0, reports }, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ passed: true, widths: reports.map(r => r.width), output }));
} finally { await browser.close(); }

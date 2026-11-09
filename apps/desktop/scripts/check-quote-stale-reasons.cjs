const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const output = process.env.QUOTE_REASONS_QA_OUTPUT || '/tmp/quote-stale-reasons-qa';
mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.QUOTE_REASONS_CHROMIUM_EXECUTABLE });
  const results = [];
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      const errors = []; page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${process.env.QUOTE_REASONS_QA_BASE_URL || 'http://localhost:5173'}/test/browser-quote-stale-reasons.html`);
      const dialog = page.locator('[data-slot="dialog-content"]');
      await dialog.waitFor();
      for (const [scenario, text] of Object.entries({ closed: '当前休市', older: '未覆盖最近已结束', closedFailure: '请求超时', aged: '超过 10 分钟', timeout: '请求超时', limited: 'HTTP 429', cooldown: '本次未再次请求来源', legacy: '缺少判定原因' })) {
        await page.getByLabel('诊断样本').selectOption(scenario);
        const banner = page.getByRole('status').first();
        await banner.getByText(new RegExp(text)).waitFor();
        assert((await banner.textContent()).includes('行情时间：'));
        assert((await banner.textContent()).includes('抓取时间：'));
        const lines = await banner.locator('.whitespace-pre-line').evaluate((element) => {
          const node = element.firstChild;
          const text = node.textContent;
          const range = document.createRange();
          function y(label) { const at = text.indexOf(label); range.setStart(node, at); range.setEnd(node, at + label.length); return range.getBoundingClientRect().top; }
          return { market: y('行情时间：'), fetched: y('抓取时间：'), whitespace: getComputedStyle(element).whiteSpace };
        });
        assert.equal(lines.whitespace, 'pre-line'); assert(lines.fetched > lines.market);
        if (scenario === 'closed') { assert((await banner.getAttribute('class')).split(' ').includes('info')); assert(!(await dialog.textContent()).includes('陈旧')); }
        else if (scenario === 'closedFailure' || scenario === 'older') assert((await banner.getAttribute('class')).split(' ').includes('stale'));
        assert(!(await dialog.textContent()).includes('可能陈旧'));
        const dimensions = await dialog.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return { x: rect.x, right: rect.right, scroll: element.scrollWidth, client: element.clientWidth, page: document.documentElement.scrollWidth };
        });
        assert(dimensions.x >= 0 && dimensions.right <= width && dimensions.scroll <= dimensions.client + 1 && dimensions.page <= width, JSON.stringify(dimensions));
        await page.screenshot({ path: `${output}/${scenario}-${width}.png`, animations: 'disabled' });
        await banner.getByRole('button', { name: '重新加载' }).click();
        await page.waitForFunction(() => document.querySelector('select').value === 'ready');
        assert.equal(await page.getByRole('status').count(), 0);
      }
      await page.getByLabel('诊断样本').selectOption('ready');
      assert.equal(await page.getByRole('status').count(), 0);
      assert.deepEqual(errors, []);
      results.push({ width, scenarios: 8, closedSnapshotInfo: true, failuresRetained: true, separateTimeRows: true, retryClearsNotice: true, freshBackupReady: true, noOverflow: true });
      console.log(JSON.stringify(results.at(-1))); await page.close();
    }
  } finally { writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2)); await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

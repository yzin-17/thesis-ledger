const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const origin = process.env.MACD_LAYER_QA_BASE_URL || 'http://localhost:5173';
const output = process.env.MACD_LAYER_QA_OUTPUT || '/tmp/macd-layering-qa';
mkdirSync(output, { recursive: true });
async function coverage(page) {
  return page.evaluate(() => {
    const canvas = [...window.macdCanvases].filter((canvas) => canvas.isConnected && canvas.width > 100)
      .sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (!canvas) return null;
    const probe = document.createElement('span'); document.body.append(probe);
    const colorCanvas = document.createElement('canvas'); colorCanvas.width = 1; colorCanvas.height = 1;
    const context = colorCanvas.getContext('2d');
    const color = (name) => { probe.style.color = `var(${name})`; context.clearRect(0, 0, 1, 1);
      context.fillStyle = getComputedStyle(probe).color; context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3); };
    const difColor = color('--chart-1'), deaColor = color('--chart-4'); probe.remove();
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const count = (rgb, start, end) => {
      let visible = 0;
      for (let x = start; x < end; x++) {
        for (let y = 0; y < canvas.height; y++) {
          const at = (y * canvas.width + x) * 4;
          if (data[at] === rgb[0] && data[at + 1] === rgb[1] && data[at + 2] === rgb[2] && data[at + 3] > 200) { visible++; break; }
        }
      }
      return visible / (end - start);
    };
    const positive = [Math.floor(canvas.width * .1), Math.floor(canvas.width * .3)];
    const negative = [Math.floor(canvas.width * .65), Math.floor(canvas.width * .85)];
    return { difPositive: count(difColor, ...positive), deaPositive: count(deaColor, ...positive),
      difNegative: count(difColor, ...negative), deaNegative: count(deaColor, ...negative) };
  });
}
async function check(page, stage, width, results) {
  await page.waitForFunction(() => [...window.macdCanvases].some((canvas) => canvas.isConnected));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const result = { width, stage, ...await coverage(page) }; results.push(result); console.log(JSON.stringify(result));
  assert(Object.entries(result).filter(([key]) => key.startsWith('dif') || key.startsWith('dea')).every(([, value]) => value >= .85), '正负柱区域的 DIF、DEA 折线须连续可见');
}
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.MACD_LAYER_CHROMIUM_EXECUTABLE });
  const results = [];
  try {
    for (const width of (process.env.MACD_LAYER_QA_WIDTHS || '1440,1024,768,390').split(',').map(Number)) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      page.setDefaultTimeout(10000);
      const errors = [], reads = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route((url) => url.pathname.startsWith('/api/'), (route) => { reads.push(route.request().url()); return route.abort(); });
      await page.addInitScript(() => {
        window.macdCanvases = new Set();
        const fill = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
          if (text === 'MACD') window.macdCanvases.add(this.canvas);
          return fill.call(this, text, ...args);
        };
      });
      await page.goto(`${origin}/test/browser-macd-layering.html`);
      await check(page, 'initial', width, results);
      await page.screenshot({ path: `${output}/macd-${width}.png`, fullPage: true, animations: 'disabled' });
      await page.getByRole('button', { name: '刷新绘图样本', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[aria-label="样本版本"]').textContent === '1');
      await check(page, 'refresh', width, results);
      await page.getByRole('button', { name: '指标', exact: true }).click();
      const menu = page.locator('[data-slot="dropdown-menu-content"]');
      await menu.getByRole('group', { name: '技术副图', exact: true }).getByRole('button', { name: 'RSI', exact: true }).click();
      await page.keyboard.press('Escape');
      await menu.waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: '指标', exact: true }).click();
      await menu.getByRole('group', { name: '技术副图', exact: true }).getByRole('button', { name: 'MACD', exact: true }).click();
      await page.keyboard.press('Escape');
      await menu.waitFor({ state: 'hidden' });
      await check(page, 'pane-restored', width, results);

      await page.getByRole('button', { name: '全屏', exact: true }).click();
      await page.getByRole('button', { name: '退出全屏', exact: true }).waitFor();
      await check(page, 'fullscreen', width, results);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '全屏', exact: true }).waitFor();
      await check(page, 'restored', width, results);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []); assert.deepEqual(reads, []);
      await page.close();
    }
  } finally { writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2)); await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

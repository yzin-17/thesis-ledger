import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const output = process.env.CAPABILITY_QA_OUTPUT ?? '/tmp/capability-first-use-qa';
const origin = process.env.CAPABILITY_QA_ORIGIN ?? 'http://127.0.0.1:5173';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: process.env.CAPABILITY_QA_CHANNEL ?? 'msedge',
});
try {
  for (const width of [1440, 1024, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${origin}/test/browser-capability-first-use.html`);
    await page.getByLabel('HiThink能力详情').click();
    await page.getByText(/中国内地ETF.*未验证，可尝试/).waitFor();
    const primary = page.getByRole('combobox').first();
    await primary.click();
    const unverified = page.getByRole('option', { name: /未验证，可尝试/ });
    await unverified.waitFor();
    assert.equal(await unverified.getAttribute('aria-disabled'), null);
    await page.screenshot({ path: join(output, `${width}-unverified.png`), fullPage: true });
    await unverified.click();
    assert.match(await primary.innerText(), /未验证，可尝试/);
    await page.getByRole('button', { name: '切换受控成功记录' }).click();
    await page.getByText(/中国内地ETF.*已验证/).waitFor();
    assert.match(await primary.innerText(), /已验证/);
    await page.getByRole('button', { name: '检查功能权限' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await dialog.getByText('所选能力已验证。').waitFor();
    const bounds = await dialog.boundingBox();
    assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert(overflow <= 1, `${width} 页面横向溢出 ${overflow}`);
    await page.screenshot({ path: join(output, `${width}-verified.png`), fullPage: true });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.match(await primary.innerText(), /已验证/);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        width,
        unverifiedSelectable: true,
        verifiedDisplayed: true,
        triggerLabelConsistent: true,
        dialogClosed: true,
        overflow,
      }),
    );
    await page.close();
  }
} finally {
  await browser.close();
}

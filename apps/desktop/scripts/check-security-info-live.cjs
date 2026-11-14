const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const output = process.env.SECURITY_INFO_QA_OUTPUT || '/tmp/security-info-qa';
mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], blockedWrites = [];
  let source;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', async (response) => {
    if (!new URL(response.url()).pathname.endsWith('/security-static-info')) return;
    const value = await response.json().catch(() => ({}));
    source = { status: response.status(), symbol: value.symbol, provider: value.provider,
      sharesPerLot: value.sharesPerLot, observedAt: value.observedAt, message: value.message };
  });
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    if (route.request().method() === 'GET') return route.continue();
    blockedWrites.push({ method: route.request().method(), path: new URL(route.request().url()).pathname });
    return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: '本次验收仅允许读取' }) });
  });
  try {
    await page.goto((process.env.SECURITY_INFO_QA_URL || 'http://localhost:5173') + '/market-data');
    await page.getByRole('tab', { name: '标的目录', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '查询证券资料', exact: true }).count(), 0);
    await page.getByRole('textbox', { name: '搜索已同步标的', exact: true }).fill('03968');
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await page.getByRole('button', { name: '查看 03968.HK 行情', exact: true }).click();
    const table = page.getByRole('table', { name: '03968.HK 证券资料', exact: true });
    const failure = page.getByText('证券资料未读取', { exact: true });
    await table.or(failure).waitFor({ timeout: 30000 });
    const hasData = await table.isVisible();
    if (hasData) await table.scrollIntoViewIfNeeded();
    else await failure.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/live-1440.png` });
    assert.deepEqual(errors, []);
    assert.deepEqual(blockedWrites, []);
    const result = { page: '真实目录搜索与共享详情', hasData, source, errors, realWrites: 0 };
    writeFileSync(`${output}/live-results.json`, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });

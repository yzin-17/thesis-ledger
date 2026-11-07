const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const schemas = require('@thesis-ledger/schemas');
const { cases, accountColumnFixture } = require('../test/portfolio-account-column-fixtures.cjs');

async function inspect(browser, origin, mode, output, width, sample) {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    colorScheme: 'light',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const fixture = accountColumnFixture(schemas, sample);
  const audit = {
    reads: [],
    detailFailures: [],
    writes: [],
    unknown: [],
    external: [],
    errors: [],
  };
  page.on('pageerror', (error) => audit.errors.push(error.message));
  let holdRefresh = false;
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) {
      audit.external.push(url.origin);
      return route.abort();
    }
    if (request.method() !== 'GET') {
      audit.writes.push(url.pathname);
      return route.abort();
    }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname.startsWith('/api/market/600000.SH/')) {
      audit.detailFailures.push(url.pathname);
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: '隔离详情来源不可用', message: '隔离详情来源不可用' }),
      });
    }
    const value = fixture(url);
    audit.reads.push(url.pathname + url.search);
    if (value === undefined) audit.unknown.push(url.pathname + url.search);
    if (url.pathname === '/api/v1/portfolio/valuation' && holdRefresh) await pending;
    return route.fulfill({
      status: value === undefined ? 503 : 200,
      contentType: 'application/json',
      body: JSON.stringify(value ?? { error: '隔离验收缺少响应' }),
    });
  });
  try {
    await page.goto(origin + '/performance');
    if (sample.id === 'empty') {
      await page.getByText('暂无记录', { exact: true }).waitFor();
      assert.equal(await page.getByText('暂无记录', { exact: true }).count(), 1);
      assert.equal(await page.getByRole('table').count(), 1);
      assert.equal(await page.getByRole('button', { name: '行情详情', exact: true }).count(), 0);
      assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= width + 1);
      await page.screenshot({
        path: path.join(output, `${mode}-${sample.id}-${width}.png`),
        fullPage: true,
      });
      return { width, sample: sample.id, empty: true, audit };
    }
    await page.getByRole('cell', { name: sample.name, exact: true }).waitFor();
    const table = page.getByRole('table');
    const container = page.locator('[data-slot="table-container"]').filter({ has: table });
    const row = table.locator('tbody tr').first();
    const original = await row.innerText();
    const geometry = await row.evaluate((element) => {
      const cell = element.cells[1];
      const range = document.createRange();
      range.selectNodeContents(cell);
      const rect = (node) => node.getBoundingClientRect().toJSON();
      const action = element.querySelector('[data-sticky-table-action="cell"]');
      const container = element.closest('[data-slot="table-container"]');
      return {
        account: cell.textContent,
        accountRect: rect(cell),
        textRect: range.getBoundingClientRect().toJSON(),
        lines: range.getClientRects().length,
        rowHeight: rect(element).height,
        action: rect(action),
        actionHeader: rect(
          element.closest('table').querySelector('[data-sticky-table-action="header"]'),
        ),
        button: rect(action.querySelector('button')),
        container: rect(container),
        clientWidth: container.clientWidth,
        scrollWidth: container.scrollWidth,
      };
    });
    const violations = [];
    if (sample.id === 'ordinary' && geometry.lines !== 1) violations.push('普通账户折行');
    if (geometry.accountRect.width < 127) violations.push('账户列阅读宽度');
    if (geometry.action.width > 128) violations.push('单按钮操作列宽度');
    assert.equal(geometry.account, sample.name);
    assert.ok(geometry.textRect.x >= geometry.accountRect.x - 1);
    assert.ok(geometry.textRect.right <= geometry.accountRect.right + 1);
    assert.ok(Math.abs(geometry.action.width - geometry.actionHeader.width) < 1);
    assert.ok(
      geometry.button.x >= geometry.action.x && geometry.button.right <= geometry.action.right,
    );
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= width + 1);
    await page.screenshot({
      path: path.join(output, `${mode}-${sample.id}-${width}.png`),
      fullPage: true,
    });
    await container.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    const pinned = await table.locator('[data-sticky-table-action="cell"]').evaluate((element) => ({
      cell: element.getBoundingClientRect().toJSON(),
      container: element.closest('[data-slot="table-container"]').getBoundingClientRect().toJSON(),
    }));
    assert.ok(Math.abs(pinned.cell.right - pinned.container.right) <= 2);
    if (sample.id === 'ordinary') {
      const sort = table.getByRole('columnheader', { name: /^按市值排序/u });
      await sort.getByRole('button').click();
      await sort.getByRole('button', { name: /当前降序/u }).waitFor();
      await sort.getByRole('button').click();
      await sort.getByRole('button', { name: /当前升序/u }).waitFor();
      assert.equal(await sort.getAttribute('aria-sort'), 'ascending');
      assert.equal(await row.innerText(), original);
      holdRefresh = true;
      await page.getByRole('button', { name: '刷新组合数据', exact: true }).click();
      await page.getByRole('status', { name: '正在刷新当前持仓', exact: true }).waitFor();
      assert.equal(await row.innerText(), original);
      await page.screenshot({
        path: path.join(output, `${mode}-refresh-${width}.png`),
        fullPage: true,
      });
      holdRefresh = false;
      release();
      await page
        .getByRole('status', { name: '正在刷新当前持仓', exact: true })
        .waitFor({ state: 'hidden' });
      assert.equal(await row.innerText(), original);
      const action = page.getByRole('button', { name: '行情详情', exact: true });
      await action.focus();
      await action.press('Enter');
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      await dialog.getByText('行情详情读取失败', { exact: true }).waitFor();
      await dialog.evaluate(async (element) => {
        const animations = element
          .getAnimations({ subtree: true })
          .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity);
        await Promise.all(animations.map((animation) => animation.finished.catch(() => {})));
      });
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= width + 1);
      assert.ok(bounds.y >= -1 && bounds.y + bounds.height <= 1001);
      await page.screenshot({
        path: path.join(output, `${mode}-detail-${width}.png`),
        fullPage: true,
      });
      await dialog.getByRole('button', { name: '关闭', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(await row.innerText(), original);
    }
    if (mode === 'current') assert.deepEqual(violations, []);
    return { width, sample: sample.id, geometry, violations, audit };
  } finally {
    release();
    await page.waitForLoadState('networkidle');
    await context.close();
    assert.deepEqual(audit.writes, []);
    assert.deepEqual(audit.external, []);
    assert.deepEqual(audit.unknown, []);
    assert.deepEqual(audit.errors, []);
  }
}

async function main() {
  const [origin, mode, output] = process.argv.slice(2);
  assert.ok(
    origin && ['baseline', 'current'].includes(mode) && output,
    '用法：node check-portfolio-account-column.cjs <本地生产资源URL> <baseline|current> <输出目录>',
  );
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
  await fs.mkdir(output, { recursive: true });
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
  });
  const results = [];
  try {
    for (const width of [1440, 1024, 768, 390]) {
      for (const sample of cases)
        results.push(await inspect(browser, origin, mode, output, width, sample));
    }
  } finally {
    await fs.writeFile(
      path.join(output, 'results.json'),
      JSON.stringify({ mode, results }, null, 2),
    );
    await browser.close();
  }
  console.log(
    JSON.stringify({
      mode,
      cases: results.length,
      violations: results.reduce((sum, result) => sum + (result.violations?.length ?? 0), 0),
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

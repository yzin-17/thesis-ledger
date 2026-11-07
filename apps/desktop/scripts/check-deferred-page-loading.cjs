const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { gzipSync } = require('node:zlib');
const { createBrowserFixtures, accountIds } = require('../test/deferred-page-browser-fixtures.cjs');
const schemas = require('@thesis-ledger/schemas');

const widths = [1440, 1024, 768, 390];
const resolveFixture = createBrowserFixtures(schemas);

async function createPage(browser, origin, width, fault) {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    colorScheme: 'light',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const audit = { reads: [], calculations: [], writes: [], external: [], unknown: [], errors: [] };
  const scripts = new Map();
  const responses = [];
  page.on('pageerror', (error) => audit.errors.push(error.message));
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.endsWith('.js') && response.ok()) {
      responses.push(
        response.body().then((body) => {
          scripts.set(new URL(response.url()).pathname, {
            bytes: body.length,
            gzip: gzipSync(body).length,
          });
        }),
      );
    }
  });
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) {
      audit.external.push(url.origin);
      return route.abort();
    }
    if (url.pathname.startsWith('/api/')) {
      const method = request.method();
      const calculation = method === 'POST' && url.pathname === '/api/v1/performance/allocation';
      if (method !== 'GET' && !calculation) {
        audit.writes.push({ method, path: url.pathname });
        return route.fulfill({ status: 409, body: '{}' });
      }
      const value = resolveFixture(url, method);
      const target = calculation ? audit.calculations : audit.reads;
      target.push(url.pathname + url.search);
      if (value === undefined) audit.unknown.push(url.pathname + url.search);
      return route.fulfill({
        status: value === undefined ? 503 : 200,
        contentType: 'application/json',
        body: JSON.stringify(value ?? { error: '隔离验收缺少响应' }),
      });
    }
    if (fault && /\/WatchlistPage-[^/]+\.js$/u.test(url.pathname)) {
      fault.requests += 1;
      if (fault.kind === 'slow') await fault.pending;
      if (fault.kind === 'failure' && fault.active) {
        return route.fulfill({ status: 503, contentType: 'text/javascript', body: '' });
      }
    }
    return route.continue();
  });
  return { page, context, audit, scripts, responses };
}

async function healthy(page, title) {
  await page.getByRole('heading', { name: title, exact: true }).waitFor();
  if (title === '收益分析') await page.getByText('受控标的', { exact: true }).waitFor();
  if (title === '数据与自动化') await page.getByText('暂无健康历史。', { exact: true }).waitFor();
  await page.locator('[aria-label="正在打开页面"]').waitFor({ state: 'hidden' });
  await page.waitForLoadState('networkidle');
  assert.equal(await page.getByText('页面暂时无法打开', { exact: true }).count(), 0);
}

async function navigate(page, pathname, label) {
  await page.getByRole('link', { name: label, exact: true }).click();
  await page.waitForURL((url) => url.pathname === pathname);
  await healthy(page, label);
}

async function capture(run, output, name) {
  const { page } = run;
  const geometry = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    overlays: [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, right: rect.right, y: rect.y, bottom: rect.bottom };
      }),
  }));
  assert.ok(geometry.document <= geometry.viewport + 1, JSON.stringify(geometry));
  for (const overlay of geometry.overlays) {
    assert.ok(overlay.x >= -1 && overlay.right <= geometry.viewport + 1, JSON.stringify(overlay));
    assert.ok(overlay.y >= -1 && overlay.bottom <= 1001, JSON.stringify(overlay));
  }
  await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
  return geometry;
}

async function finish(run) {
  await Promise.all(run.responses);
  assert.deepEqual(run.audit.writes, []);
  assert.deepEqual(run.audit.external, []);
  assert.deepEqual(run.audit.unknown, []);
  await run.context.close();
}

async function measure(browser, origin, width, output, pathname, title) {
  const run = await createPage(browser, origin, width);
  try {
    await run.page.goto(origin + pathname);
    await healthy(run.page, title);
    const geometry = await capture(run, output, `initial-${pathname.slice(1)}-${width}`);
    await Promise.all(run.responses);
    const files = [...run.scripts].map(([file, sizes]) => ({ file, ...sizes }));
    assert.deepEqual(run.audit.errors, []);
    return {
      kind: 'initial',
      pathname,
      width,
      geometry,
      files,
      bytes: files.reduce((sum, file) => sum + file.bytes, 0),
      gzip: files.reduce((sum, file) => sum + file.gzip, 0),
      audit: run.audit,
    };
  } finally {
    await finish(run);
  }
}

async function journey(browser, origin, width, output) {
  const run = await createPage(browser, origin, width);
  try {
    const { page } = run;
    await page.goto(origin + '/performance');
    await healthy(page, '收益分析');
    assert.ok(
      [...run.scripts.keys()].every(
        (file) => !/\/(?:AiChat|StrategyDashboard|WatchlistPage)-/u.test(file),
      ),
    );
    await page.getByRole('combobox', { name: '收益账户范围', exact: true }).click();
    await page.getByRole('option', { name: /受控实际二/u }).click();
    await page.waitForURL((url) => url.searchParams.get('accountId') === accountIds[1]);
    await page.getByRole('tab', { name: '配置目标', exact: true }).click();
    await page.waitForURL((url) => url.searchParams.get('tab') === 'allocation');
    await page.getByRole('button', { name: '调整目标', exact: true }).click();
    const input = page.getByRole('textbox', { name: '股票目标权重百分比' });
    await input.fill('61');
    await input.press('Escape');
    const confirm = page.getByRole('alertdialog');
    await confirm.getByRole('button', { name: '继续编辑', exact: true }).click();
    assert.equal(await input.inputValue(), '61');
    await capture(run, output, `draft-kept-${width}`);
    await page.evaluate(() => history.back());
    await confirm.getByRole('button', { name: '继续编辑', exact: true }).click();
    assert.equal(await input.inputValue(), '61');
    assert.equal(new URL(page.url()).searchParams.get('tab'), 'allocation');
    await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
    await confirm.getByRole('button', { name: '放弃修改并关闭', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await navigate(page, '/providers', '数据与自动化');
    await page.goBack();
    await page.getByRole('button', { name: '调整目标', exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('accountId'), accountIds[1]);
    const mode = page.getByRole('group', { name: /^全局账户模式/u });
    await mode.getByRole('button', { name: '模拟', exact: true }).click();
    await page.waitForURL((url) => !url.searchParams.has('accountId'));
    await page.getByRole('group', { name: /^全局账户模式：当前模拟/u }).waitFor();
    await page.getByRole('combobox', { name: '收益账户范围', exact: true }).click();
    await page.getByRole('option', { name: /受控模拟一/u }).waitFor();
    const options = await page.getByRole('option').allTextContents();
    assert.ok(options.some((text) => text.includes('受控模拟一')));
    assert.ok(options.every((text) => !text.includes('受控实际')));
    await page.keyboard.press('Escape');
    await mode.getByRole('button', { name: '实际', exact: true }).click();
    await navigate(page, '/watchlist', '自选');
    await navigate(page, '/accounts', '账户数据');
    await capture(run, output, `account-journey-${width}`);
    assert.deepEqual(run.audit.errors, []);
    return { kind: 'journey', width, options, audit: run.audit };
  } finally {
    await finish(run);
  }
}

async function slowPage(browser, origin, width, output) {
  let release;
  const fault = {
    kind: 'slow',
    requests: 0,
    pending: new Promise((resolve) => {
      release = resolve;
    }),
  };
  const run = await createPage(browser, origin, width, fault);
  try {
    const { page } = run;
    await page.goto(origin + '/performance');
    await healthy(page, '收益分析');
    await page.getByRole('link', { name: '自选', exact: true }).click();
    await page.locator('[aria-label="正在打开页面"]').waitFor();
    assert.equal(fault.requests, 1);
    await capture(run, output, `waiting-${width}`);
    await navigate(page, '/providers', '数据与自动化');
    release();
    await page.getByRole('link', { name: '自选', exact: true }).click();
    await healthy(page, '自选');
    assert.equal(fault.requests, 1);
    assert.deepEqual(run.audit.errors, []);
    return { kind: 'slow', width, chunkRequests: fault.requests, audit: run.audit };
  } finally {
    release();
    await finish(run);
  }
}

async function failedPage(browser, origin, width, output) {
  const fault = { kind: 'failure', requests: 0, active: true };
  const run = await createPage(browser, origin, width, fault);
  try {
    const { page } = run;
    await page.goto(origin + '/performance');
    await healthy(page, '收益分析');
    await page.getByRole('link', { name: '自选', exact: true }).click();
    await page.getByRole('alert').getByText('页面暂时无法打开', { exact: true }).waitFor();
    await capture(run, output, `failed-${width}`);
    await navigate(page, '/providers', '数据与自动化');
    await page.getByRole('link', { name: '自选', exact: true }).click();
    await page.getByRole('button', { name: '重新加载页面', exact: true }).waitFor();
    assert.equal(fault.requests, 1);
    fault.active = false;
    await page.getByRole('button', { name: '重新加载页面', exact: true }).click();
    await healthy(page, '自选');
    assert.equal(fault.requests, 2);
    await capture(run, output, `recovered-${width}`);
    assert.ok(
      run.audit.errors.every((message) =>
        /dynamically imported module|module script/iu.test(message),
      ),
    );
    return { kind: 'failure-recovery', width, chunkRequests: fault.requests, audit: run.audit };
  } finally {
    await finish(run);
  }
}

async function legacyRoutes(browser, origin, width, output) {
  const run = await createPage(browser, origin, width);
  try {
    const { page } = run;
    await page.goto(origin + `/portfolio?tab=allocation&accountId=${accountIds[0]}`);
    await page.waitForURL((url) => url.pathname === '/performance');
    await page.getByRole('button', { name: '调整目标', exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('accountId'), accountIds[0]);
    assert.equal(new URL(page.url()).searchParams.get('tab'), 'allocation');
    for (const oldPath of ['/position-entry', '/import-review']) {
      await page.goto(origin + `${oldPath}?accountId=${accountIds[0]}`);
      await page.waitForURL((url) => url.pathname === '/accounts');
      await healthy(page, '账户数据');
      assert.equal(new URL(page.url()).searchParams.get('accountId'), accountIds[0]);
      assert.equal(new URL(page.url()).searchParams.get('tab'), 'positions');
      await page.getByRole('tab', { name: '持仓', exact: true }).waitFor();
    }
    await capture(run, output, `legacy-routes-${width}`);
    assert.deepEqual(run.audit.errors, []);
    return { kind: 'legacy-routes', width, audit: run.audit };
  } finally {
    await finish(run);
  }
}

async function main() {
  const [origin, mode, output] = process.argv.slice(2);
  if (!origin || !['baseline', 'current'].includes(mode) || !output) {
    throw new Error(
      '用法：node check-deferred-page-loading.cjs <本地生产资源URL> <baseline|current> <输出目录>',
    );
  }
  const url = new URL(origin);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  await fs.mkdir(output, { recursive: true });
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
  });
  const results = [];
  try {
    for (const width of widths) {
      results.push(await measure(browser, origin, width, output, '/performance', '收益分析'));
      results.push(await measure(browser, origin, width, output, '/providers', '数据与自动化'));
      if (mode === 'current') {
        results.push(await journey(browser, origin, width, output));
        results.push(await slowPage(browser, origin, width, output));
        results.push(await failedPage(browser, origin, width, output));
        results.push(await legacyRoutes(browser, origin, width, output));
      }
    }
  } finally {
    await fs.writeFile(
      path.join(output, 'results.json'),
      JSON.stringify({ mode, results }, null, 2),
    );
    await browser.close();
  }
  console.log(JSON.stringify({ mode, passed: results.length }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createBrowserFixtures } = require('../test/deferred-page-browser-fixtures.cjs');
const schemas = require('@thesis-ledger/schemas');

const widths = [1440, 1024, 801, 800, 768, 521, 520, 390, 320];
const navigation = [
  ['收益分析', '/performance'],
  ['自选', '/watchlist'],
  ['账户数据', '/accounts'],
  ['风险中心', '/risk-center'],
  ['策略中心', '/strategy'],
  ['投资复盘', '/journal'],
  ['研究助手', '/ai-chat'],
  ['数据与自动化', '/providers'],
  ['市场数据', '/market-data'],
];
const fixture = createBrowserFixtures(schemas);

async function layoutSettled(page) {
  await page.locator('.app-shell').evaluate(async (element) => {
    element.getBoundingClientRect();
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished.catch(() => {})),
    );
  });
}

async function measureNavigation(page, width, collapsed) {
  const nav = page.getByRole('navigation', { name: '主导航' });
  assert.equal(await nav.getByRole('link').count(), navigation.length);
  const measurements = [];
  const violations = [];
  for (const [label, pathname] of navigation) {
    const link = nav.getByRole('link', { name: label, exact: true });
    assert.equal(new URL(await link.getAttribute('href'), page.url()).pathname, pathname);
    await link.scrollIntoViewIfNeeded();
    const value = await link.evaluate((element) => {
      const rect = (node) => node.getBoundingClientRect().toJSON();
      const style = getComputedStyle(element);
      const caption = [...element.querySelectorAll('span,small')].find(
        (node) => node.getClientRects().length > 0 && getComputedStyle(node).display !== 'none',
      );
      const range = document.createRange();
      if (caption) range.selectNodeContents(caption);
      return {
        link: rect(element),
        icon: rect(element.querySelector('svg')),
        caption: caption ? range.getBoundingClientRect().toJSON() : null,
        navigation: rect(element.closest('nav')),
        gap: style.gap,
        padding: style.padding,
        active: element.getAttribute('aria-current'),
      };
    });
    if (Math.abs(value.icon.width - 19) > 0.1 || Math.abs(value.icon.height - 19) > 0.1) {
      violations.push({
        label,
        kind: '图标尺寸',
        width: value.icon.width,
        height: value.icon.height,
      });
    }
    for (const [kind, content] of [
      ['图标边界', value.icon],
      ['文字边界', value.caption],
    ]) {
      if (!content) continue;
      if (
        content.x < value.link.x - 1 ||
        content.right > value.link.right + 1 ||
        content.y < value.link.y - 1 ||
        content.bottom > value.link.bottom + 1
      ) {
        violations.push({ label, kind, content, link: value.link });
      }
    }
    if ((!collapsed || width <= 800) && !value.caption) {
      violations.push({ label, kind: '文字缺失' });
    } else if (collapsed && width > 800) {
      assert.equal(value.caption, null, label);
    }
    assert.ok(
      value.icon.x >= value.navigation.x - 1 && value.icon.right <= value.navigation.right + 1,
    );
    if (value.link.height < (width <= 800 ? 48 : 40) - 1) {
      violations.push({ label, kind: '控件高度', height: value.link.height });
    }
    measurements.push({ label, ...value });
  }
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(documentWidth <= width + 1, JSON.stringify({ documentWidth, width }));
  assert.equal(measurements.filter((item) => item.active === 'page').length, 1);
  return { width, collapsed, documentWidth, measurements, violations };
}

async function inspect(browser, origin, mode, output, width) {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    colorScheme: 'light',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const audit = { reads: [], writes: [], external: [], unknown: [], errors: [] };
  page.on('pageerror', (error) => audit.errors.push(error.message));
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
    const value = fixture(url, 'GET');
    audit.reads.push(url.pathname + url.search);
    if (value === undefined) audit.unknown.push(url.pathname);
    return route.fulfill({
      status: value === undefined ? 503 : 200,
      contentType: 'application/json',
      body: JSON.stringify(value ?? { error: '隔离验收缺少响应' }),
    });
  });
  try {
    await page.goto(origin + '/performance');
    await page.getByText('受控标的', { exact: true }).waitFor();
    await layoutSettled(page);
    await page.screenshot({ path: path.join(output, `${mode}-${width}.png`), fullPage: true });
    const states = [await measureNavigation(page, width, false)];
    const nav = page.getByRole('navigation', { name: '主导航' });
    await nav.getByRole('link', { name: '收益分析', exact: true }).focus();
    await page.keyboard.press('Tab');
    assert.equal(
      await page.evaluate(() => document.activeElement.getAttribute('aria-label')),
      '自选',
    );
    await page.keyboard.press('Shift+Tab');
    assert.equal(
      await page.evaluate(() => document.activeElement.getAttribute('aria-label')),
      '收益分析',
    );
    const providers = nav.getByRole('link', { name: '数据与自动化', exact: true });
    await providers.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: '数据与自动化', exact: true }).waitFor();
    await page.getByText('暂无健康历史。', { exact: true }).waitFor();
    await page.goBack();
    await page.getByText('受控标的', { exact: true }).waitFor();
    const modeControl = page.getByRole('group', { name: /^全局账户模式/u });
    await modeControl.getByRole('button', { name: '模拟', exact: true }).click();
    await page.getByRole('group', { name: /^全局账户模式：当前模拟/u }).waitFor();
    await page.getByRole('cell', { name: '受控模拟一', exact: true }).waitFor();
    await modeControl.getByRole('button', { name: '实际', exact: true }).click();
    await page.getByRole('group', { name: /^全局账户模式：当前实际/u }).waitFor();
    if (width > 800) {
      await page.getByRole('button', { name: '收起左侧导航', exact: true }).click();
      await layoutSettled(page);
      states.push(await measureNavigation(page, width, true));
      await page.screenshot({
        path: path.join(output, `${mode}-${width}-collapsed.png`),
        fullPage: true,
      });
      if (width === 1440) {
        await page.setViewportSize({ width: 768, height: 1000 });
        await layoutSettled(page);
        states.push(await measureNavigation(page, 768, true));
        await page.setViewportSize({ width, height: 1000 });
        await layoutSettled(page);
        states.push(await measureNavigation(page, width, true));
      }
      await page.getByRole('button', { name: '展开左侧导航', exact: true }).click();
      await layoutSettled(page);
      states.push(await measureNavigation(page, width, false));
    }
    if (mode === 'current')
      assert.deepEqual(
        states.flatMap((state) => state.violations),
        [],
      );
    await page.waitForLoadState('networkidle');
    assert.deepEqual(audit.errors, []);
    assert.deepEqual(audit.writes, []);
    assert.deepEqual(audit.external, []);
    assert.deepEqual(audit.unknown, []);
    return { width, states, audit };
  } finally {
    await context.close();
  }
}

async function main() {
  const [origin, mode, output] = process.argv.slice(2);
  assert.ok(
    origin && ['baseline', 'current'].includes(mode) && output,
    '用法：node check-desktop-navigation.cjs <本地生产资源URL> <baseline|current> <输出目录>',
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
    for (const width of widths) results.push(await inspect(browser, origin, mode, output, width));
  } finally {
    await fs.writeFile(
      path.join(output, 'results.json'),
      JSON.stringify({ mode, results }, null, 2),
    );
    await browser.close();
  }
  const violations = results.flatMap((run) => run.states.flatMap((state) => state.violations));
  if (mode === 'baseline') assert.ok(violations.length > 0, '基线应复现图标尺寸缺陷');
  console.log(JSON.stringify({ mode, widths: results.length, violations: violations.length }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

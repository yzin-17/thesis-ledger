import { launchRegressionBrowser } from '../runtime.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = process.env.PROVIDER_HEALTH_QA_OUTPUT;
assert(output, '必须指定浏览器回执目录');
const origin = process.env.PROVIDER_HEALTH_QA_ORIGIN ?? 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
await mkdir(output, { recursive: true, mode: 0o700 });
const browser = await launchRegressionBrowser();
const reports = [];
try {
  for (const width of [1440, 1024, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    page.setDefaultTimeout(15000);
    const errors = [],
      writes = [],
      failures = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
      if (response.url().includes('/providers/health/history') && response.status() !== 200) {
        failures.push(response.status());
      }
    });
    await page.route('**/*', (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort();
      if (request.method() !== 'GET') {
        writes.push(request.method() + ' ' + url.pathname);
        return route.abort();
      }
      if (url.pathname === '/api/providers/health/history') {
        const number = Number(url.searchParams.get('page') ?? '1');
        return route.fulfill({ json: {
          page: number, pageSize: 20, total: 40, totalPages: 2,
          items: Array.from({ length: 20 }, (_, index) => ({
            provider: `分页${number}提供方${index + 1}`, state: 'healthy', latencyMs: 30 + index,
            checkedAt: '2026-11-12T00:00:00Z', source: 'manual',
          })),
        } });
      }
      if (url.pathname.startsWith('/api/')) return route.abort('blockedbyclient');
      return route.continue();
    });
    await page.goto(origin + '/test/browser-provider-health-history.html');
    const section = page.locator('section[aria-busy]').filter({
      has: page.getByRole('heading', { name: '提供方健康历史', exact: true }),
    });
    try {
      await section.waitFor();
    } catch (error) {
      console.log(
        JSON.stringify({
          width,
          url: page.url(),
          errors,
          writes,
          headings: await page.getByRole('heading').allTextContents(),
          visibleText: (await page.locator('body').innerText()).slice(0, 1400),
        }),
      );
      await page.screenshot({ path: resolve(output, `${width}-failed.png`), fullPage: true });
      throw error;
    }
    const ready = () =>
      page.waitForFunction(() => {
        const heading = [...document.querySelectorAll('h2')].find(
          (node) => node.textContent === '提供方健康历史',
        );
        const panel = heading?.closest('section');
        return (
          panel?.querySelectorAll('tbody tr').length === 20 &&
          panel.getAttribute('aria-busy') === 'false'
        );
      });
    await ready();
    assert(!/读取失败|数据可能陈旧/.test(await section.textContent()), '健康历史仍有读取告警');
    if (width === 1440) {
      await Promise.all([
        page.waitForResponse((response) =>
          response.url().includes('/providers/health/history?page=2'),
        ),
        section.getByRole('button', { name: '下一页', exact: true }).click(),
      ]);
      await ready();
      assert((await section.textContent()).includes('第 2 /'));
      await Promise.all([
        page.waitForResponse((response) =>
          response.url().includes('/providers/health/history?page=1'),
        ),
        section.getByRole('button', { name: '上一页', exact: true }).click(),
      ]);
      await ready();
    }
    await section.scrollIntoViewIfNeeded();
    await section.screenshot({ path: resolve(output, `${width}-health-history.png`) });
    if (width === 390) {
      const scrolled = await section.locator('table').evaluate((table) => {
        let parent = table.parentElement;
        while (parent && parent.scrollWidth <= parent.clientWidth) parent = parent.parentElement;
        if (!parent) return false;
        parent.scrollLeft = parent.scrollWidth;
        return parent.scrollLeft > 0;
      });
      assert(scrolled, '窄屏健康表格应能在容器内横向滚动');
      await section.screenshot({ path: resolve(output, `${width}-health-history-right.png`) });
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert(overflow <= 1, '页面横向溢出');
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, []);
    assert.deepEqual(failures, []);
    reports.push({
      width,
      rows: await section.locator('tbody tr').count(),
      overflow,
      paginationChecked: width === 1440,
      pageErrors: errors,
      writes,
      requestFailures: failures,
    });
    await page.close();
  }
  const report = { passed: true, origin, controlledData: true, realModelRequests: 0, reports };
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2), {
    flag: 'wx',
    mode: 0o600,
  });
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}

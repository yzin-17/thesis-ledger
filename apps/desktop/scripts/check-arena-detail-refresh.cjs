const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const schemas = require('@thesis-ledger/schemas');
const { ids, arenaRefreshFixture } = require('../../../scripts/fixtures/arena-detail-refresh.cjs');
const { createBrowserFixtures } = require('../test/deferred-page-browser-fixtures.cjs');

const arenaPath = '/api/v1/model-arenas/' + ids.arena;
const roundPath = arenaPath + '/rounds/' + ids.round;
const comparisonPath = arenaPath + '/comparison';
const weekPath = '/api/v1/model-weeklies/' + ids.arena + '/' + ids.week;
const scenarios = [
  { view: 'detail', paths: [arenaPath, comparisonPath], reverse: false, label: '正在刷新比赛详情' },
  { view: 'detail', paths: [arenaPath, comparisonPath], reverse: true, label: '正在刷新比赛详情' },
  { view: 'round', paths: [arenaPath, roundPath], reverse: false, label: '正在刷新比赛轮次' },
  { view: 'round', paths: [arenaPath, roundPath], reverse: true, label: '正在刷新比赛轮次' },
  { view: 'list', paths: ['/api/v1/model-arenas'], label: '正在刷新比赛列表' },
  { view: 'week-list', paths: ['/api/v1/model-weeklies'], label: '正在刷新周报列表' },
  { view: 'week', paths: [weekPath], label: '正在刷新周报详情' },
];

function address(origin, platform, view) {
  if (platform === 'desktop') {
    if (view === 'list') return origin + '/strategy/arena';
    if (view === 'detail') return origin + '/strategy/arena/' + ids.arena;
    if (view === 'round') return origin + '/strategy/arena/' + ids.arena + '/' + ids.round;
    if (view === 'week-list') return origin + '/journal/model-weeklies';
    return origin + '/journal/model-weeklies/' + ids.arena + '/' + ids.week;
  }
  const query = new URLSearchParams({ view });
  if (['detail', 'round', 'week'].includes(view)) query.set('match', ids.arena);
  if (view === 'round') query.set('round', ids.round);
  if (view === 'week') query.set('id', ids.week);
  return origin + '/test/browser-arena-refresh-mobile.html?' + query;
}

function measureIndicator(element, platform) {
  const marker = platform === 'desktop' ? element.firstElementChild : element.parentElement;
  const frame = platform === 'desktop' ? element : marker.parentElement;
  const bounds = frame.getBoundingClientRect();
  let left = Math.max(0, bounds.left);
  let right = Math.min(innerWidth, bounds.right);
  let top = Math.max(0, bounds.top);
  let bottom = Math.min(innerHeight, bounds.bottom);
  for (let parent = frame.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    const rect = parent.getBoundingClientRect();
    if (/(auto|scroll|hidden|clip)/u.test(style.overflowX)) {
      left = Math.max(left, rect.left);
      right = Math.min(right, rect.right);
    }
    if (/(auto|scroll|hidden|clip)/u.test(style.overflowY)) {
      top = Math.max(top, rect.top);
      bottom = Math.min(bottom, rect.bottom);
    }
  }
  const clip = { left: 0, right: innerWidth, top: 0, bottom: innerHeight };
  for (let parent = frame; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    const rect = parent.getBoundingClientRect();
    if (/(auto|scroll|hidden|clip)/u.test(style.overflowX)) {
      clip.left = Math.max(clip.left, rect.left);
      clip.right = Math.min(clip.right, rect.right);
    }
    if (/(auto|scroll|hidden|clip)/u.test(style.overflowY)) {
      clip.top = Math.max(clip.top, rect.top);
      clip.bottom = Math.min(clip.bottom, rect.bottom);
    }
  }
  const circle = marker.getBoundingClientRect();
  const expected = { x: (left + right) / 2, y: (top + bottom) / 2 };
  return {
    label: element.getAttribute('aria-label'),
    frame: bounds.toJSON(),
    marker: circle.toJSON(),
    expected,
    visible: right > left && bottom > top,
    dx: Math.abs(circle.x + circle.width / 2 - expected.x),
    dy: Math.abs(circle.y + circle.height / 2 - expected.y),
    clipped:
      circle.left < clip.left - 1 ||
      circle.right > clip.right + 1 ||
      circle.top < clip.top - 1 ||
      circle.bottom > clip.bottom + 1,
  };
}

async function frames(page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

async function check(browser, origin, platform, mode, output, width, scenario) {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    colorScheme: 'light',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const sample = arenaRefreshFixture(schemas);
  const common = createBrowserFixtures(schemas);
  const audit = { reads: [], writes: [], external: [], unknown: [], errors: [], planned503: [] };
  const gates = new Map();
  const held = new Set();
  const violations = [];
  const stages = [];
  const selector = platform === 'desktop' ? '[data-slot="list-refresh"]' : '[role="progressbar"]';
  const file = `${platform}-${mode}-${scenario.view}-${scenario.empty ? 'empty' : scenario.reverse ? 'second-first' : 'first-first'}-${width}`;
  page.on('pageerror', (error) => audit.errors.push(error.message));
  function response(url) {
    if (scenario.empty && scenario.paths.includes(url.pathname)) return [];
    const owned = sample.response(url);
    if (owned !== undefined) return owned;
    if (url.pathname === '/api/v1/backtests/strategies')
      return schemas.strategyDefinitionListSchema.parse([]);
    if (url.pathname === '/api/v1/backtests/runs')
      return schemas.backtestRunListReadSchema.parse([]);
    if (url.pathname === '/api/v1/strategy-submissions')
      return schemas.strategySubmissionReceiptSchema.array().parse([]);
    return common(url, 'GET');
  }
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
    audit.reads.push(url.pathname + url.search);
    if (url.pathname === '/api/v1/backtests/events') {
      return route.fulfill({
        contentType: 'text/event-stream',
        body: ': controlled\nretry: 60000\n\n',
      });
    }
    const value = response(url);
    if (value === undefined) audit.unknown.push(url.pathname + url.search);
    const gate = gates.get(url.pathname);
    let status = value === undefined ? 503 : 200;
    if (gate) {
      held.add(url.pathname);
      status = await gate.promise;
    }
    if (status === 503 && value !== undefined) audit.planned503.push(url.pathname);
    return route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(
        status === 200 ? value : { error: 'controlled_read_failure', message: '受控读取失败' },
      ),
    });
  });
  const ready = async () => {
    if (scenario.empty)
      await page
        .getByText(scenario.view === 'list' ? '暂无比赛' : '暂无已发布的周报', { exact: true })
        .waitFor();
    else if (scenario.view === 'week') await page.getByText('本周决策', { exact: true }).waitFor();
    else if (scenario.view === 'detail') {
      if (platform === 'desktop')
        await page.getByRole('cell', { name: '甲模型', exact: true }).waitFor();
      else await page.getByText(/甲模型 · 名次/u).waitFor();
    } else if (scenario.view === 'round')
      await page
        .getByText(/controlled-model \/ 甲模型/u)
        .first()
        .waitFor();
    else
      await page
        .getByRole(platform === 'desktop' ? 'link' : 'button', { name: /受控双模型比赛 ·/u })
        .first()
        .waitFor();
    await page.waitForLoadState('networkidle');
  };
  const capture = async (stage) => {
    await frames(page);
    let count = await page.locator(selector).count();
    let geometry = count
      ? await page.locator(selector).first().evaluate(measureIndicator, platform)
      : null;
    if (mode === 'current') {
      await page.waitForFunction(
        (selector) => document.querySelectorAll(selector).length === 1,
        selector,
      );
      for (let attempt = 0; attempt < 15; attempt++) {
        geometry = await page.locator(selector).first().evaluate(measureIndicator, platform);
        if (geometry.visible && geometry.dx <= 3 && geometry.dy <= 3) break;
        await frames(page);
      }
      count = await page.locator(selector).count();
      assert.equal(count, 1, '同一结果区域只有一个圈');
      assert.equal(geometry.label, scenario.label);
      assert.ok(geometry.visible && geometry.dx <= 3 && geometry.dy <= 3, JSON.stringify(geometry));
      assert.equal(geometry.clipped, false, '刷新圈完整可见');
    } else {
      if (count !== 1) violations.push(stage + ': 刷新圈数量 ' + count);
      if (geometry && (!geometry.visible || geometry.dx > 3 || geometry.dy > 3))
        violations.push(stage + ': 可见区域中央');
    }
    stages.push({ stage, count, geometry });
  };
  try {
    const target = address(origin, platform, scenario.view);
    await page.goto(target);
    await ready();
    if (scenario.view === 'week') {
      await page
        .getByText(platform === 'desktop' ? '决策后收录的标的资讯' : '决策后的价格观察（1）', {
          exact: true,
        })
        .click();
      await page.getByText(/受控后来资讯 10：/u).waitFor();
    }
    await page.screenshot({ path: path.join(output, file + '-ready.png'), fullPage: true });
    const before = await page.locator('body').innerText();
    for (const item of scenario.paths) gates.set(item, Promise.withResolvers());
    if (platform === 'mobile')
      await page.getByRole('button', { name: '刷新受控读取', exact: true }).click();
    else {
      const button = page.getByRole('button', {
        name: scenario.view.startsWith('week') ? '刷新模型周报' : '刷新策略中心',
        exact: true,
      });
      if (await button.count()) await button.click();
      if (mode === 'baseline') {
        await frames(page);
        if (!held.size) {
          violations.push('页面刷新未覆盖当前查询');
          await page.getByRole('link', { name: '收益分析', exact: true }).click();
          await page.waitForURL('**/performance');
          await page.getByRole('heading', { name: '收益分析', exact: true }).waitFor();
          await page.goBack();
          await page.waitForURL(target);
          if (scenario.view === 'week') {
            await page.getByText('决策后收录的标的资讯', { exact: true }).click();
          }
        }
      }
    }
    for (let attempt = 0; attempt < 40 && held.size < scenario.paths.length; attempt++)
      await frames(page);
    assert.equal(held.size, scenario.paths.length, '相关请求已全部进入受控等待');
    if (scenario.view === 'week')
      await page.getByText(/受控后来资讯 8：/u).scrollIntoViewIfNeeded();
    await capture('全部读取中');
    if (mode === 'current') assert.equal(await page.locator('body').innerText(), before);
    await page.screenshot({ path: path.join(output, file + '-refresh.png'), fullPage: true });
    const order = scenario.reverse ? [...scenario.paths].reverse() : scenario.paths;
    const completed = async (item, status = 200) => {
      const received = page.waitForResponse(
        (r) => new URL(r.url()).pathname === item && r.request().method() === 'GET',
      );
      gates.get(item).resolve(status);
      await received;
      await frames(page);
    };
    await completed(order[0]);
    if (order.length > 1) {
      await capture('较快请求已结束');
      if (mode === 'current') assert.equal(await page.locator('body').innerText(), before);
      await completed(order[1]);
    }
    gates.clear();
    await page.waitForLoadState('networkidle');
    assert.equal(await page.locator(selector).count(), 0);
    if (mode === 'current') assert.equal(await page.locator('body').innerText(), before);
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= width + 1);
    if (mode === 'current' && scenario.view === 'week') {
      held.clear();
      gates.set(weekPath, Promise.withResolvers());
      await page
        .getByRole('button', {
          name: platform === 'desktop' ? '刷新模型周报' : '刷新受控读取',
          exact: true,
        })
        .click();
      for (let attempt = 0; attempt < 150 && !held.has(weekPath); attempt++) await frames(page);
      assert.ok(held.has(weekPath));
      await completed(weekPath, 503);
      gates.clear();
      const retry = page.getByRole('button', {
        name: platform === 'desktop' ? '读取失败，重新读取' : '重新读取',
        exact: true,
      });
      await retry.waitFor();
      await page.getByText('本周决策', { exact: true }).waitFor();
      assert.equal(await page.locator(selector).count(), 0);
      gates.set(weekPath, Promise.withResolvers());
      held.clear();
      await retry.click();
      for (let attempt = 0; attempt < 150 && !held.has(weekPath); attempt++) await frames(page);
      assert.ok(held.has(weekPath));
      await capture('失败后的重试');
      await completed(weekPath);
      gates.clear();
      await retry.waitFor({ state: 'hidden' });
      assert.equal(await page.locator(selector).count(), 0);
      if (platform === 'desktop') {
        await page.getByRole('link', { name: /甲模型 · 观望 · 模型费用/u }).click();
        await page.waitForURL(
          '**/strategy/arena/' + ids.arena + '/' + ids.round + '#model-' + ids.first,
        );
        await page.locator('article').waitFor();
        assert.equal(await page.locator('article').count(), 1);
        await page.getByRole('link', { name: '返回来源页', exact: true }).click();
        await page.getByText('本周决策', { exact: true }).waitFor();
        assert.equal(page.url(), target);
      } else {
        await page.getByRole('button', { name: /甲模型 · 观望 · 模型费用/u }).click();
        const event = await page.evaluate(() => window.__arenaRefreshSnapshot().events.at(-1));
        assert.equal(event[1].params.match, ids.arena);
        assert.equal(event[1].params.round, ids.round);
        assert.equal(event[1].params.entrant, ids.first);
      }
    }
    return {
      width,
      view: scenario.view,
      reverse: Boolean(scenario.reverse),
      empty: Boolean(scenario.empty),
      stages,
      violations,
      audit,
    };
  } finally {
    for (const gate of gates.values()) gate.resolve(200);
    await page.waitForLoadState('networkidle').catch(() => {});
    await context.close();
    assert.deepEqual(audit.writes, []);
    assert.deepEqual(audit.external, []);
    assert.deepEqual(audit.unknown, []);
    assert.deepEqual(audit.errors, []);
  }
}

async function main() {
  const [origin, platform, mode, output] = process.argv.slice(2);
  assert.ok(
    origin &&
      ['desktop', 'mobile'].includes(platform) &&
      ['baseline', 'current'].includes(mode) &&
      output,
  );
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
  await fs.mkdir(output, { recursive: true });
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
  });
  const results = [];
  const cases = [...scenarios];
  if (mode === 'current')
    cases.push(
      { view: 'list', paths: ['/api/v1/model-arenas'], label: '正在刷新比赛列表', empty: true },
      {
        view: 'week-list',
        paths: ['/api/v1/model-weeklies'],
        label: '正在刷新周报列表',
        empty: true,
      },
    );
  try {
    for (const width of [1440, 1024, 768, 390]) {
      for (const scenario of cases)
        results.push(await check(browser, origin, platform, mode, output, width, scenario));
      console.log(JSON.stringify({ platform, mode, width, completed: results.length }));
    }
  } finally {
    await fs.writeFile(
      path.join(output, 'results.json'),
      JSON.stringify({ platform, mode, results }, null, 2),
    );
    await browser.close();
  }
  console.log(
    JSON.stringify({
      platform,
      mode,
      cases: results.length,
      violations: results.reduce((sum, r) => sum + r.violations.length, 0),
    }),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

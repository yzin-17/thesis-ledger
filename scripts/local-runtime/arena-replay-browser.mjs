// 两端真实业务组件使用受控回放响应；不向目标比赛发送写请求。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const s = await import('../../packages/schemas/dist/index.js');
const { arenaLiveFixture } = require('../fixtures/arena-live.cjs');
const output = process.env.ARENA_QA_OUTPUT ?? '/tmp/arena-replay-qa';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  for (const width of [1440, 1024, 768, 390]) for (const mobile of [false, true]) {
    const { detail, ids } = arenaLiveFixture(s), errors = [], writes = [];
    const shift = Date.parse('2026-11-02T14:30:00.000Z') - Date.parse(detail.frames[0].at);
    detail.frames = detail.frames.map((frame) => ({ ...frame, at: new Date(Date.parse(frame.at) + shift).toISOString(), marketTime: new Date(Date.parse(frame.at) + shift).toISOString() }));
    detail.timeline = { phase: 'replay', status: 'blocked', originAt: detail.frames[0].at, cursorAt: detail.frames.at(-1).at, pendingAt: null, reason: 'replay_universe_unavailable' };
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route((url) => url.pathname.endsWith('/ArenaLiveChart.tsx'), async (route) => {
      const response = await route.fetch(); await route.fulfill({ response, body: (await response.text()).replace('instance.current = chart;', 'instance.current = chart; window.__arenaChart = chart;') });
    });
    await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() === 'POST') {
        assert.equal(path, '/api/v1/arena-matches/' + ids.match + '/replay/retry'); writes.push(path);
        detail.timeline = { ...detail.timeline, status: 'ready', reason: null };
        return route.fulfill({ json: { id: ids.match, state: 'running' } });
      }
      assert.equal(route.request().method(), 'GET');
      if (path.endsWith('/identity/context')) return route.fulfill({ json: { principal: { id: ids.a } } });
      if (path.endsWith('/arena-matches/' + ids.match)) return route.fulfill({ json: detail });
      if (path.includes('/watchlist')) return route.fulfill({ json: { revision: 1, items: [], groups: [], nextOffset: null } });
      throw new Error('未登记请求 ' + path);
    });
    const url = mobile ? 'http://127.0.0.1:5188/test/browser-arena-live-mobile.html?match=' + ids.match
      : 'http://127.0.0.1:5187/test/browser-arena-live.html?path=/arena/' + ids.match;
    await page.goto(url);
    await page.getByText('回放待恢复', { exact: true }).waitFor();
    await page.getByText('历史全市场标的目录尚未就绪', { exact: true }).waitFor();
    if (!mobile) {
      await page.waitForFunction(() => window.__arenaChart?.timeScale().getVisibleRange());
      assert.equal(await page.evaluate(() => window.__arenaChart.timeScale().getVisibleRange().to), Date.parse(detail.frames.at(-1).at) / 1000, '回放图停留在历史进度');
    }
    await page.getByRole('button', { name: '重试回放', exact: true }).click();
    await page.getByText('历史回放中', { exact: true }).waitFor();
    assert.equal(writes.length, 1);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: output + '/' + width + (mobile ? '-mobile' : '-desktop') + '.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ width, mobile, blockedReason: true, progress: true, retry: true, controlledWrites: 1, realWrites: 0 }));
    await page.close();
  }
} finally { await browser.close(); }

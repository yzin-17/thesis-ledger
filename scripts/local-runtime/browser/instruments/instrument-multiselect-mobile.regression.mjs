import { launchRegressionBrowser } from '../runtime.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const origin = process.env.ARENA_MOBILE_QA_ORIGIN ?? 'http://127.0.0.1:5188';
const output = process.env.ARENA_QA_OUTPUT ?? '/tmp/instrument-multiselect-mobile-qa';
const directory = [
  ['300058.SZ', '蓝色光标'], ['300059.SZ', '东方财富'],
  ['300060.SZ', '用于检查窄屏展示和换行的较长目录标的名称'], ['300061.SZ', '分组样本'],
].map(([symbol, displayName], index) => ({
  id: `00000000-0000-4000-8000-00000000000${index + 1}`, symbol, displayName,
  canonicalCode: symbol.split('.')[0], market: 'SZ', instrumentType: 'STOCK',
  active: true, confirmable: true, disabledReason: null, generation: 1,
}));
const group = { id: '00000000-0000-4000-8000-000000000090', name: '验收分组' };
await mkdir(output, { recursive: true });
const browser = await launchRegressionBrowser();
try {
  for (const width of [1440, 1024, 768, 390]) {
    for (const view of ['ArenaCreate', 'ArenaDailyCreate']) {
      const page = await browser.newPage({ viewport: { width, height: 960 }, hasTouch: true });
      page.setDefaultTimeout(10000);
      const errors = [], writes = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
        const request = route.request(), url = new URL(request.url()), path = url.pathname;
        if (request.method() !== 'GET') { writes.push(request.method() + ' ' + path); return route.abort(); }
        if (path.endsWith('/identity/context')) return route.fulfill({ json: { principal: { id: directory[0].id } } });
        if (path.endsWith('/ai/providers')) return route.fulfill({ json: [] });
        if (path.endsWith('/instruments/search')) return route.fulfill({ json: directory.filter((item) => `${item.displayName}${item.symbol}`.includes(url.searchParams.get('q'))) });
        if (path.endsWith('/watchlist')) {
          const item = directory[3];
          const items = url.searchParams.get('group') ? [{
            id: item.id, displayName: item.displayName,
            instrument: { id: item.id, canonicalCode: item.canonicalCode, market: item.market, instrumentType: item.instrumentType, active: true },
            groupId: group.id, pinned: false, order: 0, addedAt: '2026-11-12T00:00:00Z',
          }] : [];
          return route.fulfill({ json: { revision: 1, items, groups: [group], nextOffset: null } });
        }
        return route.fulfill({ status: 404, json: { message: '受控接口未登记' } });
      });
      await page.goto(origin + '/test/browser-arena-live-mobile.html?view=' + view);
      const input = page.getByRole('textbox', { name: '代码或名称', exact: true });
      await input.waitFor();
      const search = async (text) => {
        await input.fill(text);
        await page.getByRole('button', { name: '搜索标的', exact: true }).tap();
      };
      for (const item of directory.slice(0, 3)) {
        await search(item.displayName);
        await page.getByRole('button', { name: '选择 ' + item.displayName, exact: true }).tap();
        const chip = page.getByTestId('multiselect-field').getByRole('button', { name: `移除 ${item.displayName} · ${item.symbol}`, exact: true });
        await chip.waitFor();
        assert.equal(await input.inputValue(), '');
        assert(await input.evaluate((node) => document.activeElement === node), '选中后保持输入焦点');
      }
      const selected = page.getByTestId('multiselect-field');
      assert.equal(await selected.getByRole('button').count(), 3);
      await selected.screenshot({ path: `${output}/${view}-${width}.png` });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await search('300058');
      await page.getByRole('button', { name: '取消选择 蓝色光标', exact: true }).tap();
      assert.equal(await selected.getByRole('button').count(), 2);
      assert.equal(await input.inputValue(), '');
      await search('300058');
      await page.getByRole('button', { name: '选择 蓝色光标', exact: true }).tap();
      assert.equal(await selected.getByRole('button').count(), 3);
      await selected.getByRole('button', { name: '移除 东方财富 · 300059.SZ', exact: true }).tap();
      assert.equal(await selected.getByRole('button').count(), 2);
      const groupLabel = view === 'ArenaCreate' ? '导入 验收分组' : '导入分组 · 验收分组';
      await page.getByRole('button', { name: groupLabel, exact: true }).tap();
      await selected.getByRole('button', { name: '移除 分组样本 · 300061.SZ', exact: true }).waitFor();
      assert.equal(await selected.getByRole('button').count(), 3);
      if (view === 'ArenaCreate') {
        await page.getByRole('radio', { name: '港股', exact: true }).tap();
        assert.equal(await page.getByTestId('multiselect-field').getByRole('button').count(), 0);
        assert.equal(await input.inputValue(), '');
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(writes, []);
      console.log(JSON.stringify({ width, view, inlineChips: true, selectedSearch: true, continuousAdd: true, removal: true, groupImport: true, overflow: false, nativeHost: false }));
      await page.close();
    }
  }
} finally { await browser.close(); }

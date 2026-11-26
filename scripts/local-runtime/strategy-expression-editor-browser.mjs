import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const origin = process.env.STRATEGY_EDITOR_QA_ORIGIN ?? 'http://127.0.0.1:5198';
const output = resolve(process.argv[2] ?? 'var/acceptance/strategy-expression-browser-20261119');
assert(output.includes('/var/acceptance/'), '必须使用独立受控验收目录');
const value = (field) => ({ type: 'series', sourceId: 'daily', field });
const constant = (value) => ({ type: 'constant', value });
const compare = (left, operator, right) => ({ type: 'compare', left, operator, right });
const highest = { type: 'indicator', name: 'Highest', input: value('high'), params: { period: 20 } };
const previousHigh = { type: 'lag', periods: 1, input: highest };
const positive = compare(value('close'), 'gt', value('open'));
const pivot = { type: 'confirmedPivot', side: 'low', leftBars: 2, rightBars: 2, offset: 0, input: value('low') };
const fixture = {
  schemaVersion: '3', name: '数值窗口受控验收', description: '独立模拟样本',
  executionInstrument: { symbol: '159516.SZ', market: 'CN', assetType: 'etf' }, primaryTimeframe: '1d',
  signalSources: [{ id: 'daily', priceCoordinate: 'research', asset: { symbol: '159516.SZ', market: 'CN', assetType: 'etf' }, timeframe: '1d', series: ['open', 'high', 'low', 'close', 'volume'] }],
  entry: { type: 'all', conditions: [
    compare(value('close'), 'gt', previousHigh),
    compare(value('close'), 'gt', { type: 'arithmetic', operator: 'multiply', left: { type: 'indicator', name: 'EMA', input: value('close'), params: { period: 20 } }, right: constant('1.020000000000000001') }),
    compare({ type: 'countTrue', periods: 5, condition: positive }, 'gte', constant('3')),
    { type: 'consecutive', periods: 3, condition: positive },
    { type: 'sequence', trigger: positive, capture: previousHigh, confirm: compare(value('close'), 'gt', { type: 'eventValue' }), invalidation: { type: 'not', expression: positive }, within: 5, allowSameBar: false, repeat: true },
    compare({ type: 'indicator', name: 'ADX', input: value('close'), params: { period: 14 }, output: 'plusDI' }, 'gt', constant('25')),
    compare(pivot, 'lt', { ...pivot, offset: 1 }),
    compare({ type: 'rolling', statistic: 'standardDeviation', periods: 20, ddof: 0, input: value('close') }, 'gt', constant('0')),
    compare({ type: 'absolute', input: { type: 'arithmetic', operator: 'subtract', left: value('close'), right: value('open') } }, 'gte', constant('0')),
    compare({ type: 'cumulative', statistic: 'sum', anchorAt: '2026-03-02T07:00:00Z', input: value('volume') }, 'gte', constant('0')),
  ] },
  exit: compare(constant('0'), 'eq', constant('1')), sizing: { type: 'percentOfEquity', percent: '0.2' }, risk: [],
  execution: { mode: 'exchange', orderType: 'market', timeInForce: 'DAY', timing: 'nextEligibleBarOpen' },
  cost: { commissionRate: '0.000300000000000001', slippageRate: '0.001' },
};
await mkdir(output, { recursive: true, mode: 0o700 });
await writeFile(`${output}/fixture.json`, JSON.stringify(fixture, null, 2));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const results = [];
let activePage, activeErrors = [];
try {
  for (const mobile of [false, true]) for (const width of [1440, 1024, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    activePage = page;
    page.setDefaultTimeout(20000);
    const errors = [], writes = [];
    activeErrors = errors;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript((definition) => { window.strategyEditorFixture = definition; }, fixture);
    await page.route('**/api/**', (route) => {
      const request = route.request();
      if (!new URL(request.url()).pathname.startsWith('/api/')) return route.continue();
      if (new URL(request.url()).origin !== origin) return route.abort();
      if (request.method() !== 'GET') {
        const body = request.postDataJSON(); writes.push(body.schema ?? body);
        return route.fulfill({ json: { id: 'saved-version', version: 2, schemaVersion: 3, schema: body.schema ?? body } });
      }
      return route.fulfill({ json: [{ id: 'editor-strategy', name: fixture.name, status: 'active', versions: [{ id: 'editor-version', version: 1, schemaVersion: 3, schema: fixture }] }] });
    });
    await page.goto(`${origin}/test/browser-strategy-definition-editor${mobile ? '-mobile' : ''}.html`);
    await page.locator('#root > *').waitFor({ timeout: 30000 });
    const role = mobile ? 'radio' : 'tab';
    const json = mobile ? page.getByRole('textbox', { name: '完整策略 JSON', exact: true }) : page.locator('#strategy-json');
    await page.getByRole(role, { name: '高级 JSON', exact: true }).click();
    assert.deepEqual(JSON.parse(await json.inputValue()), fixture);
    await page.getByRole(role, { name: '常用配置', exact: true }).click();
    assert.equal(await page.getByText('未识别的内容已保留', { exact: false }).count(), 0);
    const lag = page.getByRole('textbox', { name: '向前取样根数', exact: true }).first();
    await lag.focus();
    assert.equal(await lag.evaluate((element) => element === document.activeElement), true);
    await lag.fill('2');
    const sameBar = page.getByRole('switch', { name: '允许同根确认', exact: true });
    await sameBar.click();
    if (mobile) await page.getByRole('radio', { name: '样本标准差（N−1）', exact: true }).click();
    else {
      await page.getByRole('combobox', { name: '标准差口径', exact: true }).click();
      await page.getByRole('option', { name: '样本标准差（N−1）', exact: true }).click();
    }
    await page.getByRole('textbox', { name: '来源标识', exact: true }).fill('renamed');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, '页面不可横向溢出');
    await page.getByRole(role, { name: '高级 JSON', exact: true }).click();
    const edited = JSON.parse(await json.inputValue());
    assert.equal(edited.entry.conditions[0].right.periods, 2);
    assert.equal(edited.entry.conditions[4].allowSameBar, true);
    assert.equal(typeof edited.entry.conditions[4].allowSameBar, 'boolean');
    assert.equal(edited.entry.conditions[4].capture.input.input.sourceId, 'renamed');
    assert.equal(edited.entry.conditions[1].right.right.value, '1.020000000000000001');
    assert.equal(edited.entry.conditions[5].left.output, 'plusDI');
    assert.equal(edited.entry.conditions[6].right.offset, 1);
    assert.equal(edited.entry.conditions[7].left.ddof, 1);
    assert.equal(typeof edited.entry.conditions[7].left.ddof, 'number');
    assert.equal(edited.cost.commissionRate, fixture.cost.commissionRate);
    await page.getByRole(role, { name: '常用配置', exact: true }).click();
    await sameBar.hover();
    await sameBar.click();
    if (!mobile) {
      await page.getByRole('button', { name: '取消', exact: true }).click();
      await page.getByRole('button', { name: '继续编辑', exact: true }).click();
    }
    await page.getByRole('button', { name: mobile ? '确认保存新版本' : '保存为新版本', exact: true }).click();
    let saved;
    if (mobile) {
      await page.getByText('服务端已确认保存，可打开新版本。').waitFor();
      saved = writes[0];
    } else saved = JSON.parse(await page.getByTestId('saved-definition').textContent());
    assert.equal(saved.entry.conditions[4].allowSameBar, false);
    assert.equal(saved.entry.conditions[0].right.periods, 2);
    assert.equal(saved.signalSources[0].id, 'renamed');
    assert.equal(errors.length, 0, errors.join('\n'));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const name = `${mobile ? 'mobile' : 'desktop'}-${width}`;
    await writeFile(`${output}/${name}.json`, JSON.stringify(saved, null, 2));
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: false });
    results.push({ name, width, passed: true, writes: writes.length });
    await writeFile(`${output}/receipt.json`, JSON.stringify({ origin, input: fixture, results }, null, 2));
    await page.close();
  }
  console.log(JSON.stringify({ passed: results.length, output }));
} catch (error) {
  const key = `failure-${Date.now()}`;
  await writeFile(`${output}/${key}.json`, JSON.stringify({ message: error.message, errors: activeErrors, body: await activePage?.locator('body').innerText().catch(() => '') }, null, 2));
  await activePage?.screenshot({ path: `${output}/${key}.png` }).catch(() => {});
  throw error;
} finally { await browser.close(); }

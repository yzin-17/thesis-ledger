import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin = process.env.STRATEGY_EDITOR_QA_ORIGIN ?? 'http://127.0.0.1:5199';
const output = process.argv[2];
assert.ok(output, '必须指定独立验收目录');
const condition = {
  type: 'cross',
  direction: 'above',
  left: {
    type: 'indicator',
    name: 'RSI',
    input: { type: 'series', sourceId: 'daily', field: 'close' },
    params: { period: 2 },
  },
  right: { type: 'constant', value: '60' },
};
const base = {
  schemaVersion: '3',
  name: '保护启用方式受控样本',
  description: '独立模拟数据',
  executionInstrument: { symbol: '159516.SZ', market: 'CN', assetType: 'etf' },
  primaryTimeframe: '1d',
  signalSources: [
    {
      id: 'daily',
      priceCoordinate: 'research',
      asset: { symbol: '159516.SZ', market: 'CN', assetType: 'etf' },
      timeframe: '1d',
      series: ['high', 'low', 'close'],
    },
  ],
  entry: { type: 'not', expression: { type: 'positionState', field: 'isOpen' } },
  exit: {
    type: 'compare',
    operator: 'eq',
    left: { type: 'constant', value: '0' },
    right: { type: 'constant', value: '1' },
  },
  sizing: { type: 'percentOfEquity', percent: '0.2' },
  risk: [],
  execution: {
    mode: 'exchange',
    orderType: 'market',
    timeInForce: 'DAY',
    timing: 'nextEligibleBarOpen',
  },
  cost: { commissionRate: '0.0003', slippageRate: '0.001' },
};
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const results = [];
try {
  for (const format of ['immediate', 'condition', 'legacy'])
    for (const mobile of [false, true])
      for (const width of [1440, 1024, 768, 390]) {
        const stop = {
          kind: 'percent',
          percent: '0.05',
          ...(format === 'legacy'
            ? { activateWhen: condition }
            : {
                activation:
                  format === 'condition' ? { kind: 'condition', condition } : { kind: 'immediate' },
              }),
        };
        const fixture = {
          ...structuredClone(base),
          tradePlan: { version: 1, evaluation: 'barClose', stages: [], initialStop: stop },
        };
        const page = await browser.newPage({ viewport: { width, height: 960 } });
        page.setDefaultTimeout(10000);
        const errors = [],
          writes = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.addInitScript((value) => {
          window.strategyEditorFixture = value;
        }, fixture);
        await page.route('**/api/**', (route) => {
          const request = route.request();
          if (!new URL(request.url()).pathname.startsWith('/api/')) return route.continue();
          if (request.method() !== 'GET') {
            const body = request.postDataJSON();
            writes.push(body);
            return route.fulfill({
              json: {
                id: 'saved-version',
                version: 2,
                schemaVersion: 3,
                schema: body.schema ?? body,
              },
            });
          }
          return route.fulfill({
            json: [
              {
                id: 'editor-strategy',
                name: fixture.name,
                status: 'active',
                versions: [{ id: 'editor-version', version: 1, schemaVersion: 3, schema: fixture }],
              },
            ],
          });
        });
        await page.goto(
          `${origin}/test/browser-strategy-definition-editor${mobile ? '-mobile' : ''}.html`,
        );
        const tabRole = mobile ? 'radio' : 'tab';
        const advanced = () => page.getByRole(tabRole, { name: '高级 JSON', exact: true }).click();
        const common = () => page.getByRole(tabRole, { name: '常用配置', exact: true }).click();
        const json = mobile
          ? page.getByRole('textbox', { name: '完整策略 JSON', exact: true })
          : page.locator('#strategy-json');
        await advanced();
        assert.deepEqual(
          JSON.parse(await json.inputValue()),
          fixture,
          '打开页面不得迁移旧保护或更改新配置',
        );
        await common();
        if (format === 'condition') {
          if (mobile) await page.getByRole('radio', { name: '立即启用', exact: true }).click();
          else {
            await page.getByRole('combobox').filter({ hasText: '条件成立后启用' }).click();
            await page.getByRole('option', { name: '立即启用', exact: true }).click();
          }
          await advanced();
          assert.deepEqual(JSON.parse(await json.inputValue()).tradePlan.initialStop.activation, {
            kind: 'immediate',
          });
          await json.fill(JSON.stringify(fixture));
          await common();
        }
        const amount = page.getByRole('textbox', { name: '保护幅度比例', exact: true });
        await amount.focus();
        assert.equal(await amount.evaluate((element) => element === document.activeElement), true);
        await amount.fill('0.050000000000000001');
        const expected = structuredClone(fixture);
        expected.tradePlan.initialStop.percent = '0.050000000000000001';
        await advanced();
        assert.deepEqual(
          JSON.parse(await json.inputValue()),
          expected,
          '编辑距离必须保留独立启用方式及原始精度',
        );
        await common();
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        await page.screenshot({
          path: `${output}/${format}-${mobile ? 'mobile' : 'desktop'}-${width}.png`,
          fullPage: true,
        });
        await page
          .getByRole('button', { name: mobile ? '确认保存新版本' : '保存为新版本', exact: true })
          .click();
        let saved;
        if (mobile) {
          await page.getByText('服务端已确认保存，可打开新版本。').waitFor();
          saved = writes[0]?.schema ?? writes[0];
        } else saved = JSON.parse(await page.getByTestId('saved-definition').textContent());
        assert.deepEqual(saved, expected, '保存不补写或删除启用条件');
        assert.deepEqual(errors, []);
        await writeFile(
          `${output}/${format}-${mobile ? 'mobile' : 'desktop'}-${width}-saved.json`,
          JSON.stringify(saved, null, 2),
        );
        results.push({
          format,
          platform: mobile ? 'Mobile Web host' : 'Desktop Web',
          width,
          exactSave: true,
          activationSwitch: format === 'condition',
          overflow: false,
          externalWrites: 0,
        });
        await page.close();
      }
  await writeFile(`${output}/result.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ output, cases: results.length, status: 'passed' }));
} finally {
  await browser.close();
}

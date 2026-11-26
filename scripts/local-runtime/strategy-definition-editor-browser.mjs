import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const origin = process.env.STRATEGY_EDITOR_QA_ORIGIN ?? 'http://127.0.0.1:5192';
const output = process.env.STRATEGY_EDITOR_QA_OUTPUT ?? '/tmp/strategy-definition-editor-20261116';
const baseFixture = {
  schemaVersion: '3',
  name: '可视编辑受控样本',
  description: '受控样本',
  executionInstrument: { symbol: '159516.SZ', market: 'CN', assetType: 'etf' },
  primaryTimeframe: '1d',
  signalSources: [
    {
      id: 'daily',
      priceCoordinate: 'research',
      asset: { symbol: '159516.SZ', market: 'CN', assetType: 'etf' },
      timeframe: '1d',
      series: ['open', 'high', 'low', 'close', 'volume'],
    },
  ],
  entry: {
    type: 'all',
    conditions: [
      {
        type: 'compare',
        operator: 'gt',
        left: {
          type: 'indicator',
          name: 'MACD',
          input: { type: 'series', sourceId: 'daily', field: 'close' },
          params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
          output: 'histogram',
        },
        right: { type: 'constant', value: '0.000000000000000000' },
      },
      {
        type: 'cross',
        direction: 'above',
        left: { type: 'series', sourceId: 'daily', field: 'close' },
        right: {
          type: 'indicator',
          name: 'MA',
          input: { type: 'series', sourceId: 'daily', field: 'close' },
          params: { period: 2 },
        },
      },
    ],
  },
  exit: { type: 'positionState', field: 'isOpen' },
  sizing: { type: 'percentOfEquity', percent: '0.25' },
  risk: [],
  tradePlan: {
    version: 1,
    evaluation: 'barClose',
    initialStop: { kind: 'entryAtr', sourceId: 'daily', period: 14, multiple: '2' },
    stages: [
      {
        id: 'half',
        trigger: { kind: 'gainPercent', value: '0.005' },
        action: { kind: 'reduce', basis: 'remainingQuantity', fraction: '0.5' },
      },
    ],
  },
  execution: {
    mode: 'exchange',
    orderType: 'market',
    timeInForce: 'DAY',
    timing: 'nextEligibleBarOpen',
  },
  cost: { commissionRate: '0.000300000000000001', slippageRate: '0.001' },
};
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const results = [];
try {
  for (const assetType of ['etf', 'stock']) {
    const fixture = structuredClone(baseFixture);
    const prefix = assetType === 'stock' ? 'stock-' : '';
    if (assetType === 'stock') {
      fixture.executionInstrument = { symbol: '600519.SH', market: 'CN', assetType: 'stock' };
      fixture.signalSources[0].asset = fixture.executionInstrument;
    }
    for (const mobile of [false, true])
      for (const width of [1440, 1024, 768, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 960 } });
        page.setDefaultTimeout(10000);
        const errors = [],
          writes = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(message.text());
        });
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
        const sources = page.getByRole('button', {
          name: mobile ? '收起信号来源' : '信号来源',
          exact: true,
        });
        await sources.hover();
        await sources.click();
        assert.equal(
          await page.getByRole('textbox', { name: '来源标识', exact: true }).isVisible(),
          false,
        );
        await page
          .getByRole('button', { name: mobile ? '展开信号来源' : '信号来源', exact: true })
          .click();
        await page.getByRole(tabRole, { name: '高级 JSON', exact: true }).click();
        const json = mobile
          ? page.getByRole('textbox', { name: '完整策略 JSON', exact: true })
          : page.locator('#strategy-json');
        assert.deepEqual(JSON.parse(await json.inputValue()), fixture);
        await json.focus();
        assert.equal(await json.evaluate((element) => element === document.activeElement), true);
        await json.fill('{ broken');
        await page.getByRole(tabRole, { name: '常用配置', exact: true }).click();
        assert.equal(await json.inputValue(), '{ broken');
        const incomplete = {
          ...fixture,
          entry: { type: 'future', preserve: '0.000000000000000001' },
          extension: { keep: true },
        };
        await json.fill(JSON.stringify(incomplete));
        await page.getByRole(tabRole, { name: '常用配置', exact: true }).click();
        await page.getByRole('textbox', { name: '策略说明', exact: true }).fill('修复中');
        if (!mobile) {
          await page.getByRole('button', { name: '取消', exact: true }).click();
          await page.getByRole('button', { name: '继续编辑', exact: true }).click();
          assert.equal(
            await page.getByRole('textbox', { name: '策略说明', exact: true }).inputValue(),
            '修复中',
          );
        }
        await page.getByRole(tabRole, { name: '高级 JSON', exact: true }).click();
        assert.deepEqual(JSON.parse(await json.inputValue()), {
          ...incomplete,
          description: '修复中',
        });
        await json.fill(JSON.stringify(fixture));
        await page.getByRole(tabRole, { name: '常用配置', exact: true }).click();
        await page
          .getByRole('textbox', { name: '卖出数量比例', exact: true })
          .fill('0.250000000000000001');
        await page.getByRole('textbox', { name: '来源标识', exact: true }).fill('renamed');
        await page.getByRole('button', { name: '删除信号来源 1', exact: true }).click();
        await page.getByText('来源仍被引用：', { exact: false }).waitFor();
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
          '页面不能横向溢出',
        );
        await page
          .getByRole('button', { name: mobile ? '确认保存新版本' : '保存为新版本', exact: true })
          .click();
        let saved;
        if (mobile) {
          await page.getByText('服务端已确认保存，可打开新版本。').waitFor();
          saved = writes[0]?.schema ?? writes[0];
        } else saved = JSON.parse(await page.getByTestId('saved-definition').textContent());
        assert.equal(saved.tradePlan.stages[0].action.fraction, '0.250000000000000001');
        assert.equal(saved.tradePlan.initialStop.sourceId, 'renamed');
        assert.equal(saved.entry.conditions[0].left.input.sourceId, 'renamed');
        assert.equal(
          saved.entry.conditions[0].right.value,
          fixture.entry.conditions[0].right.value,
        );
        assert.equal(saved.entry.conditions[1].left.sourceId, 'renamed');
        await writeFile(
          `${output}/${prefix}${mobile ? 'mobile' : 'desktop'}-${width}-saved.json`,
          JSON.stringify(saved, null, 2),
        );
        assert.equal(saved.signalSources[0].priceCoordinate, 'research');
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
          '保存后页面不能横向溢出',
        );
        await page.screenshot({
          path: `${output}/${prefix}${mobile ? 'mobile' : 'desktop'}-${width}.png`,
          fullPage: true,
        });
        assert.deepEqual(errors, []);
        results.push({
          platform: mobile ? 'Mobile Web host' : 'Desktop Web',
          assetType,
          width,
          sourceRename: true,
          precision: true,
          unknownPreserved: true,
          syntaxGuard: true,
          focus: true,
          collapse: true,
          ...(mobile ? {} : { cancelRetainsDraft: true }),
          overflow: false,
          externalWrites: 0,
        });
        await page.close();
      }
  }
  await writeFile(`${output}/result.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ output, cases: results.length, status: 'passed' }));
} finally {
  await browser.close();
}

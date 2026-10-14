import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { strategySchema, backtestExecutionModelSchemaV3,
  backtestRunPreparationIntentV3Schema } from '../packages/schemas/dist/index.js';

export const compositionScope = Object.freeze({ symbol: '600519.SH', market: 'CN',
  start: '2026-10-08', end: '2026-10-09' });

/** 复用已有归一化固定快照研究设置；只生成隔离验收输入，不保存策略或运行。 */
export async function createCompositionTargetInput(clock = new Date().toISOString()) {
  assert(Number.isFinite(Date.parse(clock)), '验收时钟无效');
  const fixture = async (name) => JSON.parse(await readFile(
    new URL(`../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'));
  const raw = await fixture('backtest-v2.exchange.json');
  const asset = { symbol: compositionScope.symbol, market: 'CN', assetType: 'stock' };
  const close = { type: 'series', sourceId: 'execution', field: 'close' };
  const average = { type: 'indicator', name: 'MA', input: close, params: { period: 1 } };
  raw.name = '统一能力组合冻结验收';
  raw.executionInstrument = asset;
  raw.signalSources = [{ id: 'execution', asset, timeframe: '1d', series: ['close'] }];
  raw.entry = { type: 'compare', operator: 'gte', left: close, right: average };
  raw.exit = { type: 'compare', operator: 'lt', left: close, right: average };
  raw.risk = [];
  raw.cost.slippageRate = '0';
  const strategy = strategySchema.parse(raw);
  const model = await fixture('backtest-execution-model.cn-2024q1.json');
  const range = { start: compositionScope.start, end: compositionScope.end };
  model.id = 'cn-600519-unified-composition-acceptance';
  model.scope = { ...model.scope, symbol: asset.symbol, range };
  assert.equal(model.segments.length, 1, '只复用原单段显式模型');
  const segment = model.segments[0];
  segment.id = 'selected-whole-window-model';
  segment.range = range;
  segment.source = { kind: 'userConfiguration', revision: '1', configuredAt: clock,
    description: '复用现行归一化固定快照研究设置的隔离组合验收。',
    references: ['docs/specs/2026-10-09-unified-data-capability-adapter.md'] };
  segment.assumptions = [
    '前复权归一化连续价格及连续单位；单次模拟金额 CNY 10000，零滑点。',
    '佣金双向成交额 0.0003，每笔最低 CNY 5，包含规费及经手费。',
    '整窗卖出印花税 0.0005、双向过户费 0.00001 为既有研究设置，未按历史变化拼接。',
    '每笔每项应用最低额后按 CNY 两位小数 halfUp 舍入。',
    '成交后首个交易日可卖、卖出资金当日可再投资；无日涨跌幅、整手及价位限制。',
  ];
  segment.execution.price = { kind: 'noDailyLimit', reason: '归一化研究按连续价格计算' };
  segment.execution.normalizedExecution = { priceCoordinate: 'continuous-decimal',
    quantityUnits: 'continuous-normalized-decimal', lotSizeConstraint: 'not-applied',
    tickSizeConstraint: 'not-applied', dailyPriceLimit: 'not-applied', feeBasis: 'simulatedTurnover' };
  const executionModel = backtestExecutionModelSchemaV3.parse(model);
  const intent = backtestRunPreparationIntentV3Schema.parse({ contractVersion: 3,
    requestId: randomUUID(), adjustment: 'qfq', accountingBasis: 'normalized-series',
    history: { basis: 'fixed-provider-snapshot' }, warmupBudgetSessions: 1,
    freezeTimePolicy: 'after-acquisition', runConfig: { startDate: range.start, endDate: range.end,
      dataAsOf: clock, baseCurrency: 'CNY', initialCash: { CNY: '100000' },
      valuationPolicy: { baseTimezone: 'Asia/Shanghai', dailyValuationTime: '15:00',
        pricePolicy: 'latestAvailable', fxPolicy: 'latestAvailable' }, executionModel } });
  return { strategy, intent };
}

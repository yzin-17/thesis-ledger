import { expect, it } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { BacktestStrategy, NumericExpression } from '@thesis-ledger/schemas';
import { planBacktestPriceInputs } from '../../src/backtest/backtest-dependency-price.js';
import { practicalV6Input } from './practical-v6-input.fixture.js';

it('新范围的累计锚点由已冻结父窗核对，预算内已有数据可用，窗外仍拒绝且不补取', async () => {
  const root = await mkdtemp(join(tmpdir(), 'research-frozen-anchor-'));
  try {
    const f = await practicalV6Input(join(root, 'inputs'), 'hourly');
    const strategy = structuredClone(f.seed), sourceId = strategy.signalSources[0]!.id;
    strategy.signalSources[0]!.series = ['close'];
    strategy.signalSources.push({ ...strategy.signalSources[0]!, id: 'hourly', timeframe: '60m', series: ['close'] });
    const entry = (anchorAt: string): BacktestStrategy['entry'] => {
      const cumulative: NumericExpression = { type: 'cumulative', statistic: 'sum', anchorAt,
        input: { type: 'series', sourceId, field: 'close' } };
      const hourly: NumericExpression = { type: 'series', sourceId: 'hourly', field: 'close' };
      return { type: 'all', conditions: [
        { type: 'compare', operator: 'gt', left: cumulative, right: { type: 'lag', periods: 1, input: cumulative } },
        { type: 'compare', operator: 'gt', left: hourly, right: { type: 'indicator', name: 'MA', input: hourly, params: { period: 5 } } },
      ] };
    };
    strategy.entry = entry('2026-03-02T07:00:00Z');
    const plan = planBacktestPriceInputs(strategy, f.runConfig);
    expect(plan.warmup.startDate).toBe('2026-03-02');
    expect(plan.blockingIssues).toHaveLength(0);
    const snapshot = await f.freeze(join(root, 'inside'), strategy);
    const result = await snapshot.run(); expect(await snapshot.run()).toEqual(result);
    expect(result.analyticsVersion).toBe('research-analytics-v2');
    const legacy = structuredClone(f.runConfig); delete legacy.priceResearch!.dataScope;
    expect(planBacktestPriceInputs(strategy, legacy).blockingIssues).toContainEqual(expect.objectContaining({ code: 'INVALID_WARMUP_RANGE' }));
    strategy.entry = entry('2024-01-02T07:00:00Z');
    await expect(f.freeze(join(root, 'outside'), strategy)).rejects.toThrow('冻结窗口未覆盖请求及预热范围');
  } finally { await rm(root, { recursive: true, force: true }); }
}, 60_000);

const receipt = process.env.PRACTICAL_V6_WINDOW_RECEIPT;
it.skipIf(!receipt)('原父窗不足仍拒绝；新准备上的原AST诊断重放不修补lag／阈值', async () => {
  const root = await mkdtemp(join(tmpdir(), 'model-frozen-anchor-'));
  try {
    const directory = resolve(receipt!);
    const raw = JSON.parse(await readFile(join(directory, 'timeframes-anchor.json'), 'utf8'));
    const before = JSON.stringify(raw.definition);
    const f = await practicalV6Input(join(root, 'inputs'), 'hourly', join(directory, 'timeframes-anchor-inputs'));
    await expect(f.freeze(join(root, 'old-snapshot'), raw.definition)).rejects.toThrow('冻结窗口未覆盖请求及预热范围');
    const fresh = await practicalV6Input(join(root, 'fresh-inputs'), 'hourly');
    const snapshot = await fresh.freeze(join(root, 'new-snapshot'), raw.definition);
    const result = await snapshot.run(); expect(await snapshot.run()).toEqual(result);
    expect(JSON.stringify(raw.definition)).toBe(before);
    expect(result.analyticsVersion).toBe('research-analytics-v2');
    // 技术执行成功不改变原业务语义结论：小时值仍带模型自行添加的lag。
  } finally { await rm(root, { recursive: true, force: true }); }
}, 60_000);

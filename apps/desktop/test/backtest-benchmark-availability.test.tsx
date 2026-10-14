import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { backtestResultSchemaV3, wholeShareWindowBenchmarkCostVersionV3 } from '@thesis-ledger/schemas';
import { BacktestPriceDisclosure } from '../src/features/strategy/BacktestPriceDisclosure.js';
import { StrategyBacktestResultTabs } from '../src/features/strategy/StrategyBacktestDetailSections.js';
import {
  backtestBenchmarkDisplayMetrics,
  backtestPartialResultSummary,
} from '../src/features/strategy/strategy-backtest-result-availability.model.js';
import { buildBacktestDiagnosticExport } from '../src/features/strategy/strategy-backtest-diagnostics.model.js';
import type { BacktestJob, BacktestJobResult } from '../src/features/strategy/strategy.types.js';

const manifest = JSON.parse(
  readFileSync(
    new URL(
      '../../../packages/schemas/fixtures/backtest-snapshot-v3.manifest.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const available = (value: string) => ({ status: 'available', value });
const result = (): BacktestJobResult => ({
  source: 'BACKTEST',
  runId: 'run-benchmark',
  strategyVersionId: 'strategy-v2',
  snapshotId: 'a'.repeat(64),
  engineVersion: 'runner-v2',
  marketRuleVersion: 'rules-v1',
  calendarVersion: 'calendar-v1',
  aggregationVersion: 'aggregation-v1',
  contentHash: 'a'.repeat(64),
  resultChecksum: 'b'.repeat(16),
  schemaVersion: '3',
  snapshotVersion: 'snapshot-manifest-v3',
  completeness: 'complete',
  rejectedOrders: [],
  simulationFills: [],
  trades: [],
  equityCurve: [
    { occurredAt: '2023-08-23T07:00:00.000Z', value: { amount: '100000', currency: 'CNY' } },
    { occurredAt: '2023-08-29T07:00:00.000Z', value: { amount: '110000', currency: 'CNY' } },
  ],
  metrics: { totalReturn: available('0.1'), maxDrawdown: available('-0.03') },
  benchmark: { totalReturn: available('0.02'), excessReturn: available('0.08') },
  benchmarkCompatibility: {
    status: 'compatible',
    strategyFingerprint: 'a'.repeat(16),
    benchmarkFingerprint: 'a'.repeat(16),
    missingFields: [],
    differentFields: [],
    costAssumption: {
      kind: 'execution-model',
      version: 'execution-model-cost-v1',
      fingerprint: 'b'.repeat(16),
    },
  },
  executionPriceProtocol: manifest.executionPriceProtocol,
  comparableDataFingerprint: 'c'.repeat(64),
  actualSources: manifest.actualSources,
  warnings: [
    'BENCHMARK_EVALUATION:v3-buy-first-in-range-close-liquidate-last-in-range-close-by-trading-date-v2',
  ],
});
const job = (value: BacktestJobResult): BacktestJob => ({
  id: 'job-benchmark',
  strategyVersionId: 'strategy-v2',
  status: 'succeeded',
  mode: 'V2',
  period: { start: '2023-08-23', end: '2023-08-29' },
  input: { runConfig: { baseCurrency: 'CNY', initialCash: { CNY: '100000' } } },
  result: value,
});
const markup = (value: BacktestJobResult) =>
  renderToStaticMarkup(<StrategyBacktestResultTabs job={job(value)} />);

describe('基准净收益与按指标结果说明', () => {
  it('整股成本新版本展示实际预算和费用，旧原价规则结果仍保留不可用说明', () => {
    const value = result();
    const protocol = JSON.parse(readFileSync(new URL(
      '../../../packages/schemas/fixtures/execution-price.raw-events.json', import.meta.url,
    ), 'utf8'));
    protocol.history = { basis: 'fixed-provider-snapshot' };
    protocol.marketRuleResearch = 'raw-prices-no-corporate-actions-v1';
    value.executionPriceProtocol = protocol;
    value.actualSources = value.actualSources?.map(source => {
      if (source.routeKey.kind !== 'bar') return source;
      return { ...source, symbol: 'GME.US', routeKey: {
        ...source.routeKey, market: 'US', assetType: 'STOCK', adjustment: 'none',
      } };
    });
    value.benchmarkCompatibility!.costAssumption = { kind: 'execution-model',
      version: wholeShareWindowBenchmarkCostVersionV3, fingerprint: 'b'.repeat(16) };
    expect(backtestResultSchemaV3.safeParse(value).success).toBe(true);
    const html = renderToStaticMarkup(<BacktestPriceDisclosure result={value} />);
    expect(html).toContain('按实际整数股及成交日期逐笔计费');
    expect(html).toContain('最大整数股并保留余款');
    expect(html).not.toContain('规则研究基准未纳入');
    value.benchmarkCompatibility!.costAssumption = { kind: 'unsupported',
      version: 'v3-market-rule-benchmark-unavailable-v1', fingerprint: 'b'.repeat(16) };
    expect(renderToStaticMarkup(<BacktestPriceDisclosure result={value} />)).toContain('规则研究基准未纳入');
  });
  it('执行模型成本说明、首末清算定义和V3合同保持一致', () => {
    const value = result();
    expect(backtestResultSchemaV3.safeParse(value).success).toBe(true);
    const html = renderToStaticMarkup(<BacktestPriceDisclosure result={value} />);
    expect(html).toContain('按各自成交日期、方向和金额逐笔计费');
    expect(html).toContain('最后对齐日收盘清算');
    expect(html).toContain('净收益差为策略净收益减基准净收益');
    expect(html).not.toContain('成本：未知');
  });

  it('概览显示服务端策略净收益、基准净收益和兼容的净收益差', () => {
    const value = result();
    const before = structuredClone(value);
    const html = markup(value);
    for (const text of ['策略净收益', '10.00%', '基准净收益', '2.00%', '净收益差', '8.00%'])
      expect(html).toContain(text);
    expect(value).toEqual(before);
  });

  it('旧不支持成本说明明确指向该冻结版本', () => {
    const value = result();
    value.benchmarkCompatibility = {
      ...(value.benchmarkCompatibility as object),
      costAssumption: {
        kind: 'unsupported',
        version: 'legacy-cost-v1',
        fingerprint: 'a'.repeat(16),
      },
    };
    const html = renderToStaticMarkup(<BacktestPriceDisclosure result={value} />);
    expect(html).toContain('该冻结版本不支持所选费用规则');
    expect(html).not.toContain('当前成本模型不支持');
  });

  it('旧基准不可用时继续展示有效收益、回撤、资产与交易，缺失不补零', () => {
    const value = result();
    value.completeness = 'partial';
    value.benchmark = {
      totalReturn: { status: 'unavailable', reason: 'BENCHMARK_COST_MODEL_UNSUPPORTED' },
      excessReturn: { status: 'unavailable', reason: 'BENCHMARK_RETURN_UNAVAILABLE' },
    };
    value.simulationFills = [
      { id: 'fill-1' },
      { id: 'fill-2' },
      { id: 'fill-3' },
      { id: 'fill-4' },
    ];
    value.trades = [{ id: 'trade-1' }, { id: 'trade-2' }];
    const html = markup(value);
    for (const text of [
      '结果部分可用',
      '策略净收益',
      '10.00%',
      '3.00%',
      '110,000.00',
      '已平仓交易数',
      '该冻结版本不支持所选基准费用规则',
      '不可用：基准净收益不可用',
    ])
      expect(html).toContain(text);
    expect(backtestBenchmarkDisplayMetrics(value)?.excessReturn).toEqual(
      value.benchmark.excessReturn,
    );
    expect(backtestPartialResultSummary(value)).toContain('有效指标、权益与成交仍按各自状态展示');
  });

  it.each(['incompatible', 'unverified', undefined])(
    '比较口径%s时阻止已有数值冒充可比收益',
    (status) => {
      const value = result();
      value.benchmark = { totalReturn: available('0.02'), excessReturn: available('1.23') };
      value.benchmarkCompatibility = status ? { status } : undefined;
      const html = markup(value);
      expect(html).toContain('2.00%');
      expect(html).not.toContain('123.00%');
      expect(html).toContain('口径');
    },
  );

  it.each(['strategy', 'benchmark'])('缺少%s净收益时不展示比较数值', (missing) => {
    const value = result();
    if (missing === 'strategy')
      value.metrics = { totalReturn: { status: 'unavailable', reason: 'FX_UNAVAILABLE' } };
    else
      value.benchmark = {
        totalReturn: { status: 'unavailable', reason: 'INSUFFICIENT_BENCHMARK_POINTS' },
        excessReturn: available('0.08'),
      };
    expect(backtestBenchmarkDisplayMetrics(value)?.excessReturn).toMatchObject({
      status: 'unavailable',
    });
    expect(markup(value)).not.toContain('8.00%');
  });

  it('有效零收益和零收益差照常显示', () => {
    const value = result();
    value.metrics = { totalReturn: available('0') };
    value.benchmark = { totalReturn: available('0'), excessReturn: available('0') };
    expect(backtestBenchmarkDisplayMetrics(value)?.excessReturn).toEqual(available('0'));
    expect(markup(value)).toContain('0.00%');
  });

  it.each(['incomplete-report', 'different-fingerprints'])(
    '报告声明兼容但%s时不能展示比较数值',
    (failure) => {
      const value = result();
      value.benchmark = { totalReturn: available('0.02'), excessReturn: available('1.23') };
      if (failure === 'incomplete-report') value.benchmarkCompatibility = { status: 'compatible' };
      else
        value.benchmarkCompatibility = {
          ...(value.benchmarkCompatibility as object),
          benchmarkFingerprint: 'd'.repeat(16),
        };
      expect(markup(value)).not.toContain('123.00%');
      expect(backtestBenchmarkDisplayMetrics(value)?.excessReturn).toMatchObject({
        status: 'unavailable',
      });
    },
  );

  it('研究说明不改变complete，历史partial也不被客户端强行升级', () => {
    const value = result();
    value.warnings = ['固定供应商快照；历史首次可见时钟未验证。'];
    expect(markup(value)).not.toContain('结果部分可用');
    value.completeness = 'partial';
    expect(markup(value)).toContain('结果标记为部分可用');
    expect(value.completeness).toBe('partial');
  });

  it('没有记录基准约定时不补造首末清算口径', () => {
    const value = result();
    value.warnings = [];
    expect(renderToStaticMarkup(<BacktestPriceDisclosure result={value} />)).not.toContain(
      '最后对齐日收盘清算',
    );
  });

  it('格式2诊断保留基准原始状态及成本身份，继续使用字段白名单', () => {
    const value = result();
    value.benchmarkCompatibility = {
      ...(value.benchmarkCompatibility as object),
      authorization: 'secret-benchmark',
      costAssumption: {
        kind: 'execution-model',
        version: 'execution-model-cost-v1',
        fingerprint: 'b'.repeat(16),
        apiKey: 'secret-cost',
      },
    };
    const payload = buildBacktestDiagnosticExport(job(value), value);
    expect(payload.formatVersion).toBe(2);
    expect(payload.outcome.benchmark.totalReturn).toMatchObject(available('0.02'));
    expect(payload.outcome.benchmarkCompatibility.costAssumption).toMatchObject({
      kind: 'execution-model',
      version: 'execution-model-cost-v1',
      fingerprint: 'b'.repeat(16),
    });
    expect(JSON.stringify(payload)).not.toContain('secret-');
  });
});

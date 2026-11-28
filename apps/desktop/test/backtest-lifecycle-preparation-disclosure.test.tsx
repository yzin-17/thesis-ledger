import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  marketLifecycleStatusEvidenceV1Schema,
  runConfigSchemaV3,
  type MarketLifecycleStatusEvidenceV1,
} from '@thesis-ledger/schemas';
import { BacktestLifecyclePreparationDisclosure } from '../src/features/strategy/BacktestLifecyclePreparationDisclosure.js';
import { BacktestLifecycleResearchChoice } from '../src/features/strategy/BacktestLifecycleResearchChoice.js';
import { lifecyclePreparationDiagnosticExport } from '../src/features/strategy/backtest-lifecycle-preparation-diagnostics.js';
const config = (composition?: MarketLifecycleStatusEvidenceV1) => {
  const read = (name: string) =>
    JSON.parse(
      readFileSync(new URL(`../../../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'),
    );
  const model = read('backtest-execution-model.cn-2024q1.json');
  const range = composition?.range ?? { start: '2026-05-10', end: '2026-05-22' };
  model.scope = {
    ...model.scope,
    market: 'CN',
    symbol: composition?.symbol ?? '000995.SZ',
    instrumentType: 'STOCK',
    range,
  };
  model.segments.forEach(
    (segment: { range: { start: string; end: string }; execution: Record<string, unknown> }) => {
      segment.range = range;
      segment.execution.price = { kind: 'noDailyLimit', reason: '受控归一化研究' };
      segment.execution.normalizedExecution = {
        priceCoordinate: 'continuous-decimal',
        quantityUnits: 'continuous-normalized-decimal',
        lotSizeConstraint: 'not-applied',
        tickSizeConstraint: 'not-applied',
        dailyPriceLimit: 'not-applied',
        feeBasis: 'simulatedTurnover',
      };
    },
  );
  const value = {
    schemaVersion: 'backtest-trade-config-v1',
    startDate: range.start,
    endDate: range.end,
    dataAsOf: '2026-06-01T00:00:00Z',
    baseCurrency: 'CNY',
    initialCash: { CNY: '100000' },
    valuationPolicy: {
      baseTimezone: 'Asia/Shanghai',
      dailyValuationTime: '15:00',
      pricePolicy: 'latestAvailable',
      fxPolicy: 'latestAvailable',
    },
    executionModel: model,
    executionPriceProtocol: read('execution-price.normalized-snapshot.json'),
  } as Record<string, unknown>;
  value.frozenExecutionWindow = {
    version: 'market-frozen-window-v1',
    identityFingerprint: 'c'.repeat(64),
    responseHash: 'b'.repeat(64),
  };
  value.lifecyclePreparation = {
    version: 'listed-bars-warmup-v1',
    response: composition ?? JSON.parse(
      readFileSync(
        new URL(
          '../../../packages/schemas/fixtures/market-basic-lifecycle-v3.response.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ).response,
    inputHash: 'a'.repeat(64),
    priceResponseHash: 'b'.repeat(64),
    requiredWarmupBars: 2,
    signalStartDate: composition?.range.start ?? '2026-05-20',
  };
  return runConfigSchemaV3.parse(value);
};
describe('生命周期协议选择、结果和诊断披露', () => {
  it('旧配置不追加披露，明确选择文案保留原数量与未知规则', () => {
    expect(renderToStaticMarkup(<BacktestLifecyclePreparationDisclosure config={{}} />)).toBe('');
    const html = renderToStaticMarkup(
      <BacktestLifecycleResearchChoice selected={false} onChange={() => {}} />,
    );
    expect(html).toContain('保持起点前预热');
    expect(html).toContain('上市后积累真实预热');
    expect(html).toContain('原预热数量');
  });
  it('新配置页面及导出复用实际信号日期、原预热数和独立源', () => {
    const value = config();
    const html = renderToStaticMarkup(<BacktestLifecyclePreparationDisclosure config={value} />);
    expect(html).toContain('实际信号起点');
    expect(html).toContain('原策略需 2');
    expect(html).toContain('baostock');
    const result = lifecyclePreparationDiagnosticExport(value, (text) =>
      typeof text === 'string' ? text : null,
    );
    expect(result).toMatchObject({
      requestedRange: { start: value.startDate, end: value.endDate },
      signalStartDate: '2026-05-20',
      requiredWarmupBars: 2,
      inputHash: 'a'.repeat(64),
      priceResponseHash: 'b'.repeat(64),
    });
  });
  it('分别披露组合后的交易状态与基础日期来源', () => {
    const { valid } = JSON.parse(readFileSync(new URL(
      '../../../packages/schemas/test/fixtures/market-status-capabilities-v1.shared.json',
      import.meta.url,
    ), 'utf8'));
    const status = valid.find((sample: { name: string }) => sample.name === 'DAILY_TRADING_STATUS');
    const dates = valid.find((sample: { name: string }) => sample.name === 'SECURITY_BASIC_DATES');
    dates.request.routeTarget.providerId = dates.result.routeTarget.providerId = 'fixture-dates';
    const samples = [status, dates];
    const evidence = marketLifecycleStatusEvidenceV1Schema.parse({
      contract: 'market-lifecycle-status-evidence-v1',
      symbol: status.result.symbol,
      range: status.result.range,
      basicLifecycle: dates.result.dates,
      days: status.result.days,
      composition: {
        version: 'market-status-composition-v1',
        policy: {
          contractVersion: 1,
          consumer: 'thesis-ledger',
          requestId: 'controlled-life-policy',
          revision: 7,
          sourceDesiredRevision: 7,
          enabled: true,
          appliedAt: '2024-07-15T00:00:00Z',
          routes: samples.map(({ request }) => ({
            key: request.routeKey,
            enabled: true,
            reason: null,
            targets: [{ ...request.routeTarget, eligible: true, reason: null }],
          })),
        },
        entries: samples.map(({ request, result }) => {
          const query = { ...request };
          delete query.routeTarget;
          delete query.policyRevision;
          return { query, requirement: 'optional', status: 'included', request, result };
        }),
      },
    });
    const value = config(evidence);
    const html = renderToStaticMarkup(<BacktestLifecyclePreparationDisclosure config={value} />);
    expect(html).toContain('日级交易状态 fixture-status / fixture-upstream');
    expect(html).toContain('证券基础日期 fixture-dates / fixture-upstream');
    expect(lifecyclePreparationDiagnosticExport(value, String)).toMatchObject({
      lifecycleSources: [
        { capability: 'DAILY_TRADING_STATUS', providerId: 'fixture-status' },
        { capability: 'SECURITY_BASIC_DATES', providerId: 'fixture-dates' },
      ],
    });
  });
});

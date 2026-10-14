import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { runConfigSchemaV3 } from '@thesis-ledger/schemas';
import { BacktestLifecyclePreparationDisclosure } from '../src/features/strategy/BacktestLifecyclePreparationDisclosure.js';
import { BacktestLifecycleResearchChoice } from '../src/features/strategy/BacktestLifecycleResearchChoice.js';
import { lifecyclePreparationDiagnosticExport } from '../src/features/strategy/backtest-lifecycle-preparation-diagnostics.js';
const config = () => {
  const read = (name: string) =>
    JSON.parse(
      readFileSync(new URL(`../../../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'),
    );
  const model = read('backtest-execution-model.cn-2024q1.json');
  model.scope = {
    ...model.scope,
    market: 'CN',
    symbol: '000995.SZ',
    instrumentType: 'STOCK',
    range: { start: '2026-05-10', end: '2026-05-22' },
  };
  model.segments.forEach(
    (segment: { range: { start: string; end: string }; execution: Record<string, unknown> }) => {
      segment.range = { start: '2026-05-10', end: '2026-05-22' };
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
    schemaVersion: '3',
    startDate: '2026-05-10',
    endDate: '2026-05-22',
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
    response: JSON.parse(
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
    signalStartDate: '2026-05-20',
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
});

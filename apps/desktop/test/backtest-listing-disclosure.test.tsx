import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { backtestResultSchemaV3, backtestUnknownListingWarningV3 } from '@thesis-ledger/schemas';
import { BacktestRunDisclosure } from '../src/features/strategy/BacktestModelDisclosure.js';
import {
  buildBacktestDiagnosticExport,
  buildBacktestDiagnosticSummary,
} from '../src/features/strategy/strategy-backtest-diagnostics.model.js';
import type { BacktestJob } from '../src/features/strategy/strategy.types.js';

const saved = JSON.parse(
  readFileSync(new URL('./fixtures/backtest-listing-disclosure-v3.json', import.meta.url), 'utf8'),
);
const currentResult = (result: Record<string, unknown>) => backtestResultSchemaV3.parse({
  ...result,
  schemaVersion: 'backtest-trade-result-v1',
  snapshotVersion: 'backtest-trade-snapshot-manifest-v1',
});
const known = currentResult(saved.known);
const unknown = currentResult(saved.unknown);
const job = (result: typeof unknown): BacktestJob => ({
  id: 'listing-disclosure',
  strategyVersionId: 'version',
  status: 'succeeded',
  result,
});

describe('上市日期未知的已有数据说明', () => {
  it.each(['complete', 'partial'] as const)('提示不改变 %s 的结果状态或指标', (completeness) => {
    const result = { ...unknown, completeness };
    const before = structuredClone(result);
    const html = renderToStaticMarkup(<BacktestRunDisclosure job={job(result)} />);
    expect(html).toContain('价格与数据');
    expect(html).toContain(backtestUnknownListingWarningV3);
    expect(html).toContain(completeness === 'complete' ? '完整' : '部分完整');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('确认上市');
    expect(html).not.toContain('text-destructive');
    expect(result).toEqual(before);
    expect(unknown.metrics).toEqual(known.metrics);
    expect(unknown.completeness).toBe(known.completeness);
  });

  it('上市日期已知时没有提示，旧合同原样本不能作为现行结果读取', () => {
    expect(renderToStaticMarkup(<BacktestRunDisclosure job={job(known)} />)).not.toContain(
      backtestUnknownListingWarningV3,
    );
    expect(backtestResultSchemaV3.safeParse(saved.known).success).toBe(false);
  });

  it('提示进入脱敏 JSON 与诊断摘要，不暴露其他警告中的凭据', () => {
    const result = { ...unknown, warnings: [...unknown.warnings, 'cookie=session-secret'] };
    const value = job(result);
    const payload = buildBacktestDiagnosticExport(value, result, new Date('2026-10-07T00:00:00Z'));
    expect(payload.outcome.warnings).toContain(backtestUnknownListingWarningV3);
    const text = buildBacktestDiagnosticSummary(payload);
    expect(text).toContain(`数据说明：${backtestUnknownListingWarningV3}`);
    expect(JSON.stringify(payload)).not.toContain('session-secret');
    expect(text).not.toContain('session-secret');
    expect(payload.outcome.completeness).toBe(unknown.completeness);
  });
});

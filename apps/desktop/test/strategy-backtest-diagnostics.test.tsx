import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  BACKTEST_DIAGNOSTIC_FORMAT,
  buildBacktestDiagnosticExport,
  buildBacktestDiagnosticSummary,
  sanitizeBacktestDiagnosticText,
} from '../src/features/strategy/strategy-backtest-diagnostics.model.js';
import { StrategyBacktestDiagnostics } from '../src/features/strategy/StrategyBacktestDiagnostics.js';
import { StrategyBacktestResultTabs } from '../src/features/strategy/StrategyBacktestDetailSections.js';
import type {
  BacktestJob,
  BacktestJobResult,
} from '../src/features/strategy/strategy.types.js';

const longHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const result = (overrides: Partial<BacktestJobResult> = {}): BacktestJobResult => ({
  source: 'BACKTEST',
  runId: 'run-1',
  strategyVersionId: 'version-1',
  schemaVersion: '2',
  completeness: 'complete',
  snapshotId: longHash,
  contentHash: longHash,
  resultChecksum: 'result-checksum',
  engineVersion: 'engine-2.1.0',
  marketRuleVersion: 'market-rules-v1',
  calendarVersion: 'calendar-v1',
  aggregationVersion: 'bar-aggregation-v1',
  metrics: {
    totalReturn: { status: 'available', value: '0.1234567890123456789' },
    profitFactor: { status: 'unavailable', reason: 'NO_LOSING_TRADES' },
  },
  warnings: [],
  ...overrides,
});

const job = (overrides: Partial<BacktestJob> = {}): BacktestJob => ({
  id: 'job-1',
  strategyVersionId: 'version-1',
  mode: 'V2',
  status: 'succeeded',
  period: { start: '2025-01-01', end: '2025-12-31' },
  input: {
    request: { authorization: 'Bearer must-not-export' },
    providerConfig: { apiKey: 'must-not-export' },
    runConfig: {
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      dataAsOf: '2026-01-01T00:00:00.000Z',
      baseCurrency: 'HKD',
      initialCash: { HKD: '250000.123456789' },
      valuationPolicy: { missingPrice: 'fail' },
      executionModel: {
        schemaVersion: 'execution-model-v1',
        id: 'hk-etf-model',
        version: '2025.1',
        scope: {
          symbol: '2800.HK',
          market: 'HK',
          instrumentType: 'ETF',
          currency: 'HKD',
          timezone: 'Asia/Hong_Kong',
          range: { start: '2025-01-01', end: '2025-12-31' },
        },
        segments: [{ id: 'segment-1' }],
      },
    },
  },
  diagnostics: { rawLog: 'must-not-export' },
  result: result(),
  ...overrides,
});

describe('回测诊断白名单导出', () => {
  it('使用版本化格式和固定根字段，不序列化请求、日志或 Provider 配置', () => {
    const payload = buildBacktestDiagnosticExport(
      job(),
      result(),
      new Date('2026-09-18T01:02:03.000Z'),
    );

    expect(payload.format).toBe(BACKTEST_DIAGNOSTIC_FORMAT);
    expect(payload.formatVersion).toBe(1);
    expect(payload.exportedAt).toBe('2026-09-18T01:02:03.000Z');
    expect(Object.keys(payload)).toEqual([
      'format',
      'formatVersion',
      'exportedAt',
      'identity',
      'frozenConfiguration',
      'outcome',
      'traceability',
      'reproduction',
    ]);
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('must-not-export');
    expect(serialized).not.toContain('providerConfig');
    expect(serialized).not.toContain('rawLog');
  });

  it('保留不同语义但值相同的快照标识与内容哈希', () => {
    const payload = buildBacktestDiagnosticExport(job(), result());
    expect(payload.traceability.snapshotId).toBe(longHash);
    expect(payload.traceability.contentHash).toBe(longHash);
    expect(Object.keys(payload.traceability)).toContain('snapshotId');
    expect(Object.keys(payload.traceability)).toContain('contentHash');
  });

  it('保留指标原始精度与不可用原因，不重新计算或补零', () => {
    const payload = buildBacktestDiagnosticExport(job(), result());
    expect(payload.outcome.metrics.totalReturn).toMatchObject({
      status: 'available',
      value: '0.1234567890123456789',
    });
    expect(payload.outcome.metrics.profitFactor).toMatchObject({
      status: 'unavailable',
      value: null,
      reason: 'NO_LOSING_TRADES',
    });
  });

  it('脱敏错误文本、鉴权头、敏感参数和带凭证 URL', () => {
    const dangerous = [
      'Authorization: Bearer top.secret.token',
      'api_key=plain-secret',
      'https://user:pass@example.com/file?access_token=url-secret',
    ].join('\r\n');
    const sanitized = sanitizeBacktestDiagnosticText(dangerous);
    expect(sanitized).not.toContain('top.secret.token');
    expect(sanitized).not.toContain('plain-secret');
    expect(sanitized).not.toContain('url-secret');
    expect(sanitized).not.toContain('user:pass');
    expect(sanitized).toContain('[已脱敏]');
    expect(sanitized).toContain('[已移除带凭证的 URL]');
    expect(sanitized).not.toContain('\r');
  });

  it('导出错误和警告前执行脱敏，并排除敏感命名的伪指标', () => {
    const unsafeResult = result({
      warnings: ['cookie=session-secret', '普通缺口说明'],
      metrics: {
        apiKey: { status: 'available', value: 'metric-secret' },
        sharpe: { status: 'unavailable', reason: 'password=reason-secret' },
      },
    });
    const payload = buildBacktestDiagnosticExport(
      job({ errorSummary: '失败：https://example.com/log?signature=signed-secret' }),
      unsafeResult,
    );
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('session-secret');
    expect(serialized).not.toContain('metric-secret');
    expect(serialized).not.toContain('reason-secret');
    expect(serialized).not.toContain('signed-secret');
    expect(payload.outcome.warnings).toContain('普通缺口说明');
  });

  it('复制摘要包含完整长值并明确依赖未验证', () => {
    const summary = buildBacktestDiagnosticSummary(buildBacktestDiagnosticExport(job(), result()));
    expect(summary).toContain(longHash);
    expect(summary).toContain('依赖可访问性尚未验证');
    expect(summary).toContain('不能视为完整复现包');
  });

  it('诊断界面按语义分组，支持完整值复制反馈和安全换行', () => {
    const markup = renderToStaticMarkup(
      createElement(StrategyBacktestDiagnostics, { job: job(), result: result() }),
    );
    for (const label of ['策略与任务', '数据与执行', '结果与校验']) {
      expect(markup).toContain(label);
    }
    expect(markup).toContain('复制诊断摘要');
    expect(markup).toContain('导出诊断 JSON');
    expect(markup).toContain('复制数据快照 ID 完整值');
    expect(markup).toContain('查看完整值');
    expect(markup).toContain('未记录');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('此导出不是完整复现包');
  });

  it('封存测试未揭示时不渲染诊断复制或导出入口', () => {
    const markup = renderToStaticMarkup(
      createElement(StrategyBacktestResultTabs, {
        job: job({
          readEligibility: {
            state: 'restricted',
            code: 'TEST_NOT_REVEALED',
            scope: 'test',
            accessedAt: null,
            revealedAt: null,
          },
        }),
      }),
    );
    expect(markup).toContain('测试结果尚未揭示');
    expect(markup).not.toContain('复制诊断摘要');
    expect(markup).not.toContain('导出诊断 JSON');
  });
});

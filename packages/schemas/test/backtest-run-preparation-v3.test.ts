import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  backtestRunPreparationRequestV3Schema,
  backtestRunPreparationResultV3Schema,
  optimizationRunPreparationRequestSchema,
  optimizationRunPreparationResultSchema,
} from '../src/index.js';

const request = () => ({
  contractVersion: 3,
  requestId: 'prepare-1',
  strategyVersionId: '11111111-1111-4111-8111-111111111111',
  adjustment: 'none',
  accountingBasis: 'raw-events',
  history: { basis: 'point-in-time', reconstructionEvidenceRef: 'bar-availability-v1' },
  runConfig: {
    startDate: '2024-01-02',
    endDate: '2024-03-29',
    dataAsOf: '2026-09-11T00:00:00Z',
    baseCurrency: 'CNY',
    initialCash: { CNY: '10000' },
    valuationPolicy: {
      baseTimezone: 'Asia/Shanghai',
      dailyValuationTime: '15:00',
      pricePolicy: 'latestAvailable',
      fxPolicy: 'latestAvailable',
    },
    executionModel: JSON.parse(
      readFileSync(
        new URL('../fixtures/backtest-execution-model.cn-2024q1.json', import.meta.url),
        'utf8',
      ),
    ),
  },
});

describe('V3配置准备合同', () => {
  it('取价完成时冻结仅允许固定快照，不能修改严格历史时点', () => {
    const input = {
      ...request(),
      history: { basis: 'fixed-provider-snapshot' },
      freezeTimePolicy: 'after-acquisition',
    };
    expect(backtestRunPreparationRequestV3Schema.safeParse(input).success).toBe(true);
    expect(
      backtestRunPreparationRequestV3Schema.safeParse({
        ...input,
        history: { basis: 'point-in-time', reconstructionEvidenceRef: 'history-proof' },
      }).success,
    ).toBe(false);
  });
  it('实验准备使用已有策略或探索范围，不能注入来源协议或Run戳', () => {
    const { strategyVersionId, ...baseIntent } = request();
    const intent = { ...baseIntent, warmupBudgetSessions: 60 };
    for (const budget of [undefined, -1, 505, 1.5]) {
      expect(
        optimizationRunPreparationRequestSchema.safeParse({
          target: { sourceMode: 'existing', strategyVersionId },
          intent: { ...intent, warmupBudgetSessions: budget },
        }).success,
      ).toBe(false);
    }
    const existing = { target: { sourceMode: 'existing', strategyVersionId }, intent };
    expect(optimizationRunPreparationRequestSchema.parse(existing)).toEqual(existing);
    const discovery = {
      target: {
        sourceMode: 'discovery',
        discoveryScope: {
          executionInstrument: { market: 'CN', symbol: '600519.SH', assetType: 'stock' },
          primaryTimeframe: '1d',
        },
      },
      intent,
    };
    expect(optimizationRunPreparationRequestSchema.parse(discovery)).toEqual(discovery);
    expect(
      optimizationRunPreparationRequestSchema.safeParse({ ...discovery, preparationStamp: {} })
        .success,
    ).toBe(false);
    expect(
      optimizationRunPreparationRequestSchema.safeParse({
        ...discovery,
        intent: { ...intent, runConfig: { ...intent.runConfig, executionPriceProtocol: {} } },
      }).success,
    ).toBe(false);
    expect(
      optimizationRunPreparationResultSchema.safeParse({
        contractVersion: 3,
        requestId: 'prepare',
        checkedAt: intent.runConfig.dataAsOf,
        scope: 'baseline-window',
        status: 'prepared',
        runConfig: intent.runConfig,
      }).success,
    ).toBe(false);
  });
  it('接受显式模型、口径和历史意图，不要求客户端提供来源协议', () => {
    expect(backtestRunPreparationRequestV3Schema.parse(request())).toEqual(request());
  });

  it.each(['executionPriceProtocol', 'priceInputBindings', 'frozenExecutionWindow'])(
    '拒绝客户端注入%s',
    (field) => {
      const input = request();
      expect(
        backtestRunPreparationRequestV3Schema.safeParse({
          ...input,
          runConfig: { ...input.runConfig, [field]: {} },
        }).success,
      ).toBe(false);
    },
  );

  it('拒绝缺模型、日期倒置、无初始现金和原始记账使用前复权', () => {
    const input = request();
    for (const runConfig of [
      { ...input.runConfig, executionModel: undefined },
      { ...input.runConfig, startDate: '2024-04-01' },
      { ...input.runConfig, initialCash: {} },
    ]) {
      expect(backtestRunPreparationRequestV3Schema.safeParse({ ...input, runConfig }).success).toBe(
        false,
      );
    }
    expect(
      backtestRunPreparationRequestV3Schema.safeParse({ ...input, adjustment: 'qfq' }).success,
    ).toBe(false);
  });

  it('不能给旧真实价格模型自动补归一化含义', () => {
    expect(
      backtestRunPreparationRequestV3Schema.safeParse({
        ...request(),
        adjustment: 'qfq',
        accountingBasis: 'normalized-series',
      }).success,
    ).toBe(false);
  });

  it('严格PIT选择缺少重建证据时拒绝，不默认降级', () => {
    expect(
      backtestRunPreparationRequestV3Schema.safeParse({
        ...request(),
        history: { basis: 'point-in-time' },
      }).success,
    ).toBe(false);
  });

  it('blocked不能混入可提交配置，prepared不能只返回空配置', () => {
    const base = {
      contractVersion: 3,
      requestId: 'prepare-1',
      checkedAt: '2026-09-11T00:00:00Z',
      scope: 'execution-window',
    };
    const diagnostic = {
      severity: 'error',
      category: 'data-unavailable',
      code: 'DATA_UNAVAILABLE',
      message: '来源不可用',
      symbol: null,
      capability: null,
      purpose: null,
      dateRange: null,
      routeKey: null,
      missingFields: [],
      incompatibleRules: [],
      targetSources: [],
      suggestedActions: [{ action: 'retry-preflight', description: '恢复来源后重试' }],
    };
    expect(
      backtestRunPreparationResultV3Schema.safeParse({
        ...base,
        status: 'blocked',
        diagnostics: [diagnostic],
      }).success,
    ).toBe(true);
    expect(
      backtestRunPreparationResultV3Schema.safeParse({
        ...base,
        status: 'blocked',
        diagnostics: [diagnostic],
        runConfig: request().runConfig,
      }).success,
    ).toBe(false);
    expect(
      backtestRunPreparationResultV3Schema.safeParse({ ...base, status: 'prepared', runConfig: {} })
        .success,
    ).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { runConfigSchemaV3, strategySchema, type BacktestStrategy } from '@thesis-ledger/schemas';
import type { ArtifactRow } from '../../src/backtest/backtest-artifact-store.js';
import { runExchangeVertical } from '../../src/backtest/backtest-v2-execution-exchange.js';
import {
  artifact,
  frozenExecutionRules,
  exchangeExecutionModel,
  runConfig,
  runConfigV3,
  normalizedExecutionModel,
} from './v2-execution.fixtures.js';

describe('V2 场内运行时集成', () => {
  it('旧配置在读取执行事实前拒绝', () => {
    expect(() =>
      runExchangeVertical({
        runConfig: { ...runConfig, schemaVersion: undefined, executionPriceProtocol: undefined },
      } as never),
    ).toThrow('SNAPSHOT_VERSION_MISMATCH');
  });
  it('使用下一交易日开盘事实完成金额仓位计算与成交', () => {
    const exchangeStrategy = strategySchema.parse({
      schemaVersion: '2',
      name: '场内次日开盘回测',
      signalSources: [
        {
          id: 'close',
          asset: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
          timeframe: '1d',
          series: ['open', 'close'],
        },
      ],
      executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
      primaryTimeframe: '1d',
      entry: {
        type: 'compare',
        operator: 'gt',
        left: { type: 'series', sourceId: 'close', field: 'close' },
        right: { type: 'series', sourceId: 'close', field: 'open' },
      },
      exit: {
        type: 'compare',
        operator: 'lt',
        left: { type: 'series', sourceId: 'close', field: 'close' },
        right: { type: 'constant', value: '0' },
      },
      sizing: { type: 'fixedAmount', amount: '1000' },
      risk: [],
      execution: {
        mode: 'exchange',
        orderType: 'market',
        timeInForce: 'DAY',
        timing: 'nextEligibleBarOpen',
      },
      cost: { commissionRate: '0', slippageRate: '0' },
    }) as BacktestStrategy;
    const signalRef = artifact('signal/CN-600519.SH-1d.parquet');
    const executionRef = artifact('execution/CN-600519.SH-1d.parquet');
    const calendarRef = artifact('calendar/CN.parquet');
    const instrumentRef = artifact('instrumentFacts/CN-600519.SH.parquet');
    const corporateActionRef = artifact('corporateActions/CN-600519.SH.parquet');
    const dailyRows: ArtifactRow[] = [
      {
        symbol: '600519.SH',
        market: 'CN',
        timeframe: '1d',
        occurredAt: '2026-09-07T00:00:00Z',
        availableAt: '2026-09-07T07:00:00Z',
        openedAt: '2026-09-07T01:30:00Z',
        openAvailableAt: '2026-09-07T01:30:00Z',
        open: '10',
        high: '12',
        low: '9',
        close: '11',
        volume: '1000',
        provider: 'fixture',
        providerRevision: 'raw-1',
        quality: 'complete',
      },
      {
        symbol: '600519.SH',
        market: 'CN',
        timeframe: '1d',
        occurredAt: '2026-09-10T00:00:00Z',
        availableAt: '2026-09-10T07:00:00Z',
        openedAt: '2026-09-10T01:30:00Z',
        openAvailableAt: '2026-09-10T01:30:00Z',
        open: '10',
        high: '12',
        low: '9',
        close: '11',
        volume: '1000',
        provider: 'fixture',
        providerRevision: 'raw-1',
        quality: 'complete',
      },
      {
        symbol: '600519.SH',
        market: 'CN',
        timeframe: '1d',
        occurredAt: '2026-09-08T00:00:00Z',
        availableAt: '2026-09-08T07:00:00Z',
        openedAt: '2026-09-08T01:30:00Z',
        openAvailableAt: '2026-09-08T01:30:00Z',
        open: '10',
        high: '12',
        low: '9',
        close: '11',
        volume: '1000',
        provider: 'fixture',
        providerRevision: 'raw-1',
        quality: 'complete',
      },
      {
        symbol: '600519.SH',
        market: 'CN',
        timeframe: '1d',
        occurredAt: '2026-09-09T00:00:00Z',
        availableAt: '2026-09-09T07:00:00Z',
        openedAt: '2026-09-09T01:30:00Z',
        openAvailableAt: '2026-09-09T01:30:00Z',
        open: '10',
        high: '12',
        low: '9',
        close: '11',
        volume: '1000',
        provider: 'fixture',
        providerRevision: 'raw-1',
        quality: 'complete',
      },
    ];
    const rows = new Map<string, readonly ArtifactRow[]>([
      [signalRef.key, dailyRows],
      [executionRef.key, dailyRows],
      [
        calendarRef.key,
        [
          {
            market: 'CN',
            timezone: 'Asia/Shanghai',
            provider: 'fixture',
            providerRevision: 'calendar-1',
            availableAt: '2026-09-01T00:00:00Z',
            sessions: JSON.stringify([
              { startMinute: 570, endMinute: 690 },
              { startMinute: 780, endMinute: 900 },
            ]),
            sessionOverrides: JSON.stringify([]),
            holidays: JSON.stringify([]),
            range: JSON.stringify({ start: '2026-01-01', end: '2026-12-31' }),
          },
        ],
      ],
      [
        instrumentRef.key,
        [
          {
            symbol: '600519.SH',
            market: 'CN',
            instrumentType: 'STOCK',
            currency: 'CNY',
            lotSize: '100',
            tickSize: '0.01',
            tradable: true,
            executionRules: frozenExecutionRules(),
            provider: 'fixture',
            providerRevision: 'instrument-1',
            occurredAt: '2026-09-01T00:00:00Z',
            availableAt: '2026-09-01T00:00:00Z',
          },
        ],
      ],
      [
        corporateActionRef.key,
        [
          {
            symbol: '600519.SH',
            market: 'CN',
            instrumentType: 'STOCK',
            type: 'CASH_DIVIDEND',
            effectiveDate: '2026-09-10',
            cashAmount: '1',
            currency: 'CNY',
            occurredAt: '2026-09-10T00:00:00Z',
            availableAt: '2026-09-07T00:00:00Z',
            provider: 'akshare',
            providerRevision: 'akshare-corporate-actions-v1',
          },
        ],
      ],
    ]);

    const exchangeRunConfig = runConfigSchemaV3.parse({
      ...runConfig,
      initialCash: { CNY: '1001' },
    });
    const result = runExchangeVertical({
      runId: 'run-exchange',
      strategyVersionId: 'strategy-exchange',
      snapshotId: 'snapshot-exchange',
      strategy: exchangeStrategy,
      runConfig: exchangeRunConfig,
      rows,
      artifacts: [signalRef, executionRef, calendarRef, instrumentRef, corporateActionRef],
      engineVersion: 'runner-v2',
      marketRuleVersion: 'rules-v1',
      calendarVersion: 'calendar-v1',
      aggregationVersion: 'aggregation-v1',
    });

    expect(result.rejects).toEqual([]);
    expect(result.fills).toHaveLength(1);
    expect(result.fills[0]).toMatchObject({
      quantity: '100',
      price: '10',
      charges: [{ amount: '1', currency: 'CNY' }],
      occurredAt: '2026-09-09T01:30:00Z',
    });

    const v3RawRows = new Map(rows);
    v3RawRows.set(
      corporateActionRef.key,
      rows.get(corporateActionRef.key)!.map((row) => ({
        ...row,
        effectiveDate: '2026-09-10',
      })),
    );
    const v3RawResult = runExchangeVertical({
      runId: 'run-exchange-v3-raw',
      strategyVersionId: 'strategy-exchange',
      snapshotId: 'snapshot-exchange-v3-raw',
      strategy: exchangeStrategy,
      runConfig: runConfigV3(exchangeRunConfig, 'raw-events'),
      rows: v3RawRows,
      artifacts: [signalRef, executionRef, calendarRef, instrumentRef, corporateActionRef],
      engineVersion: 'runner-v2',
      marketRuleVersion: 'rules-v1',
      calendarVersion: 'calendar-v1',
      aggregationVersion: 'aggregation-v1',
    });
    expect(
      v3RawResult.fills.map(({ side, quantity, price, charges, occurredAt }) => ({
        side,
        quantity,
        price,
        charges,
        occurredAt,
      })),
    ).toEqual(
      result.fills.map(({ side, quantity, price, charges, occurredAt }) => ({
        side,
        quantity,
        price,
        charges,
        occurredAt,
      })),
    );
    // 当前合同在明确生效日开盘记入 100 份 × 1 元分红。
    expect(result.analytics.metrics.totalReturn).toEqual({
      status: 'available',
      value: '0.1988011988011988012',
    });
    expect(v3RawResult.analytics.metrics.totalReturn).toEqual({
      status: 'available',
      value: '0.1988011988011988012',
    });

    const qfqRows = new Map(rows);
    const normalizedBars = dailyRows.map((row) => ({
      ...row,
      open: '12.34',
      high: '12.4',
      low: '12.3',
      close: '12.35',
      adjustment: 'qfq',
      quantityBasis: 'normalized-units',
      providerRevision: 'fixed-qfq-v1',
    }));
    qfqRows.set(signalRef.key, normalizedBars);
    qfqRows.set(executionRef.key, normalizedBars);
    const normalizedResult = runExchangeVertical({
      runId: 'run-exchange-v3-normalized',
      strategyVersionId: 'strategy-exchange',
      snapshotId: 'snapshot-exchange-v3-normalized',
      strategy: exchangeStrategy,
      runConfig: runConfigV3(exchangeRunConfig, 'normalized-series', normalizedExecutionModel()),
      rows: qfqRows,
      artifacts: [signalRef, executionRef, calendarRef, instrumentRef, corporateActionRef],
      engineVersion: 'runner-v3-normalized',
      marketRuleVersion: 'rules-v1',
      calendarVersion: 'calendar-v1',
      aggregationVersion: 'aggregation-v1',
    });
    expect(normalizedResult.rejects).toEqual([]);
    expect(normalizedResult.fills).toHaveLength(1);
    expect(normalizedResult.fills[0]).toMatchObject({
      price: '12.34',
      occurredAt: '2026-09-09T01:30:00Z',
    });
    const normalizedWithoutCorporateActions = runExchangeVertical({
      runId: 'run-exchange-v3-normalized-no-actions',
      strategyVersionId: 'strategy-exchange',
      snapshotId: 'snapshot-exchange-v3-normalized-no-actions',
      strategy: exchangeStrategy,
      runConfig: runConfigV3(exchangeRunConfig, 'normalized-series', normalizedExecutionModel()),
      rows: new Map([...qfqRows].filter(([key]) => key !== corporateActionRef.key)),
      artifacts: [signalRef, executionRef, calendarRef, instrumentRef],
      engineVersion: 'runner-v3-normalized',
      marketRuleVersion: 'rules-v1',
      calendarVersion: 'calendar-v1',
      aggregationVersion: 'aggregation-v1',
    });
    expect(
      normalizedResult.fills.map(({ side, quantity, price, charges, occurredAt }) => ({
        side,
        quantity,
        price,
        charges,
        occurredAt,
      })),
    ).toEqual(
      normalizedWithoutCorporateActions.fills.map(
        ({ side, quantity, price, charges, occurredAt }) => ({
          side,
          quantity,
          price,
          charges,
          occurredAt,
        }),
      ),
    );
    expect(normalizedResult.analytics.metrics.totalReturn).toEqual(
      normalizedWithoutCorporateActions.analytics.metrics.totalReturn,
    );

    const modelRunConfig = runConfigSchemaV3.parse({
      ...runConfig,
      initialCash: { CNY: '2000' },
      executionModel: exchangeExecutionModel(),
    });
    const modelInput = {
      runId: 'run-exchange-model',
      strategyVersionId: 'strategy-exchange-model',
      snapshotId: 'snapshot-exchange-model',
      strategy: strategySchema.parse({
        ...exchangeStrategy,
        exit: { type: 'positionState', field: 'isOpen' },
      }) as BacktestStrategy,
      runConfig: modelRunConfig,
      rows,
      artifacts: [signalRef, executionRef, calendarRef, instrumentRef],
      engineVersion: 'runner-v2',
      marketRuleVersion: 'model-v1',
      calendarVersion: 'calendar-v1',
      aggregationVersion: 'aggregation-v1',
    };
    const modelResult = runExchangeVertical(modelInput);
    expect(modelResult.rejects).toEqual([]);
    expect(modelResult.fills.map((fill) => fill.side)).toEqual(['buy', 'sell']);
    expect(modelResult.fills[0]?.charges).toEqual([
      { amount: '5', currency: 'CNY' },
      { amount: '0.01', currency: 'CNY' },
    ]);
    expect(modelResult.fills[1]?.charges).toEqual([
      { amount: '5', currency: 'CNY' },
      { amount: '0.5', currency: 'CNY' },
      { amount: '0.01', currency: 'CNY' },
    ]);
    expect(modelResult.analytics.equityCurve.length).toBeGreaterThan(2);
    expect(modelResult.analytics.completeness).toBe('complete');
    const modelRerun = runExchangeVertical(modelInput);
    expect(modelRerun.analytics.resultChecksum).toBe(modelResult.analytics.resultChecksum);

    const fullCloseRows = new Map(rows);
    fullCloseRows.set(
      executionRef.key,
      (rows.get(executionRef.key) ?? []).map((row) =>
        row.occurredAt === '2026-09-10T00:00:00Z' ? { ...row, open: '10.5' } : row,
      ),
    );
    const fullCloseStrategy = strategySchema.parse({
      ...exchangeStrategy,
      exit: { type: 'positionState', field: 'isOpen' },
      sizing: { type: 'percentOfEquity', percent: '0.5' },
    }) as BacktestStrategy;
    const fullCloseResult = runExchangeVertical({
      ...modelInput,
      runId: 'run-exchange-full-close',
      snapshotId: 'snapshot-exchange-full-close',
      strategy: fullCloseStrategy,
      rows: fullCloseRows,
    });
    expect(fullCloseResult.rejects).toEqual([]);
    expect(fullCloseResult.fills.map((fill) => [fill.side, fill.quantity])).toEqual([
      ['buy', '100'],
      ['sell', '100'],
    ]);

    const terminalRunConfig = runConfigSchemaV3.parse({
      ...modelRunConfig,
      startDate: '2026-09-10',
      endDate: '2026-09-10',
    });
    const terminalResult = runExchangeVertical({
      ...modelInput,
      runId: 'run-exchange-terminal-bar',
      snapshotId: 'snapshot-exchange-terminal-bar',
      runConfig: terminalRunConfig,
      strategy: exchangeStrategy,
      rows,
    });
    expect(terminalResult.rejects).toHaveLength(1);
    expect(terminalResult.rejects[0]).toMatchObject({ code: 'DAY_EXPIRED' });
    expect(terminalResult.fills).toEqual([]);
    expect(terminalResult.analytics.equityCurve.length).toBeGreaterThan(0);

    const instrumentRow = rows.get(instrumentRef.key)?.[0];
    expect(instrumentRow).toBeDefined();
    rows.set(instrumentRef.key, [
      {
        ...instrumentRow,
        executionRules: frozenExecutionRules({ version: 'rules-v2', maxDownRatio: '0.05' }),
      },
    ]);
    const limited = runExchangeVertical({
      runId: 'run-exchange-price-limit',
      strategyVersionId: 'strategy-exchange',
      snapshotId: 'snapshot-exchange-price-limit',
      strategy: exchangeStrategy,
      runConfig: exchangeRunConfig,
      rows,
      artifacts: [signalRef, executionRef, calendarRef, instrumentRef, corporateActionRef],
      engineVersion: 'runner-v2',
      marketRuleVersion: 'rules-v2',
      calendarVersion: 'calendar-v1',
      aggregationVersion: 'aggregation-v1',
    });
    expect(limited.rejects).toContainEqual(
      expect.objectContaining({
        code: 'RULE_REJECTED',
        inputFacts: expect.arrayContaining(['reasonCode=PRICE_LIMIT']),
      }),
    );

    rows.set(instrumentRef.key, [
      {
        ...instrumentRow,
        executionRules: frozenExecutionRules({ status: 'unavailable' }),
      },
    ]);
    expect(() =>
      runExchangeVertical({
        runId: 'run-exchange-missing-rules',
        strategyVersionId: 'strategy-exchange',
        snapshotId: 'snapshot-exchange-missing-rules',
        strategy: exchangeStrategy,
        runConfig: exchangeRunConfig,
        rows,
        artifacts: [signalRef, executionRef, calendarRef, instrumentRef, corporateActionRef],
        engineVersion: 'runner-v2',
        marketRuleVersion: 'rules-v1',
        calendarVersion: 'calendar-v1',
        aggregationVersion: 'aggregation-v1',
      }),
    ).toThrow('历史市场规则覆盖不完整');

    rows.set(instrumentRef.key, [instrumentRow!]);
    rows.set(corporateActionRef.key, [
      {
        ...(rows.get(corporateActionRef.key)?.[0] ?? {}),
        currency: 'HKD',
      },
    ]);
    const rejected = runExchangeVertical({
      runId: 'run-exchange-rejected-action',
      strategyVersionId: 'strategy-exchange',
      snapshotId: 'snapshot-exchange-rejected-action',
      strategy: exchangeStrategy,
      runConfig: exchangeRunConfig,
      rows,
      artifacts: [signalRef, executionRef, calendarRef, instrumentRef, corporateActionRef],
      engineVersion: 'runner-v2',
      marketRuleVersion: 'rules-v1',
      calendarVersion: 'calendar-v1',
      aggregationVersion: 'aggregation-v1',
    });
    expect(rejected.rejects).toContainEqual(
      expect.objectContaining({ code: 'RULE_REJECTED', reason: '现金分红币种必须与执行标的一致' }),
    );
    expect(rejected.analytics.completeness).toBe('unavailable');
  });

  it('按执行标的时钟与价格评价跨标的信号策略的风险退出', () => {
    const crossAssetStrategy = strategySchema.parse({
      schemaVersion: '2',
      name: '跨标的信号风险退出',
      signalSources: [
        {
          id: 'signal-b',
          asset: { symbol: '000001.SZ', market: 'CN', assetType: 'stock' },
          timeframe: '1d',
          series: ['close'],
        },
      ],
      executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
      primaryTimeframe: '1d',
      entry: {
        type: 'compare',
        operator: 'gt',
        left: { type: 'series', sourceId: 'signal-b', field: 'close' },
        right: { type: 'constant', value: '10' },
      },
      exit: {
        type: 'compare',
        operator: 'lt',
        left: { type: 'series', sourceId: 'signal-b', field: 'close' },
        right: { type: 'constant', value: '0' },
      },
      sizing: { type: 'fixedQuantity', quantity: '100' },
      risk: [{ type: 'fixedStop', percent: '0.1' }],
      execution: {
        mode: 'exchange',
        orderType: 'market',
        timeInForce: 'DAY',
        timing: 'nextEligibleBarOpen',
      },
      cost: { commissionRate: '0', slippageRate: '0' },
    }) as BacktestStrategy;
    const signalRef = artifact('signal/CN-000001.SZ-1d.parquet');
    const executionRef = artifact('execution/CN-600519.SH-1d.parquet');
    const calendarRef = artifact('calendar/CN.parquet');
    const instrumentRef = artifact('instrumentFacts/CN-600519.SH.parquet');
    const dates = ['08', '09', '10', '11'];
    const signalRows: ArtifactRow[] = dates.map((day) => ({
      symbol: '000001.SZ',
      market: 'CN',
      timeframe: '1d',
      occurredAt: `2026-09-${day}T00:00:00Z`,
      availableAt: `2026-09-${day}T07:00:00Z`,
      open: '10',
      high: '11',
      low: '9',
      close: '11',
      volume: '1000',
      provider: 'fixture',
      providerRevision: 'signal-b-1',
      quality: 'complete',
    }));
    const executionRows: ArtifactRow[] = dates.map((day, index) => ({
      symbol: '600519.SH',
      market: 'CN',
      timeframe: '1d',
      occurredAt: `2026-09-${day}T00:00:00Z`,
      availableAt: `2026-09-${day}T07:00:00Z`,
      openedAt: `2026-09-${day}T01:30:00Z`,
      openAvailableAt: `2026-09-${day}T01:30:00Z`,
      open: index < 3 ? '100' : '80',
      high: '101',
      low: index < 2 ? '99' : '79',
      close: index < 2 ? '100' : '80',
      volume: '1000',
      provider: 'fixture',
      providerRevision: 'execution-a-1',
      quality: 'complete',
    }));
    const rows = new Map<string, readonly ArtifactRow[]>([
      [signalRef.key, signalRows],
      [executionRef.key, executionRows],
      [
        calendarRef.key,
        [
          {
            market: 'CN',
            timezone: 'Asia/Shanghai',
            provider: 'fixture',
            providerRevision: 'calendar-1',
            availableAt: '2026-09-01T00:00:00Z',
            sessions: JSON.stringify([
              { startMinute: 570, endMinute: 690 },
              { startMinute: 780, endMinute: 900 },
            ]),
            sessionOverrides: JSON.stringify([]),
            holidays: JSON.stringify([]),
            range: JSON.stringify({ start: '2026-01-01', end: '2026-12-31' }),
          },
        ],
      ],
      [
        instrumentRef.key,
        [
          {
            symbol: '600519.SH',
            market: 'CN',
            instrumentType: 'STOCK',
            currency: 'CNY',
            lotSize: '100',
            tickSize: '0.01',
            tradable: true,
            executionRules: frozenExecutionRules(),
            provider: 'fixture',
            providerRevision: 'instrument-1',
            occurredAt: '2026-09-01T00:00:00Z',
            availableAt: '2026-09-01T00:00:00Z',
          },
        ],
      ],
    ]);

    const result = runExchangeVertical({
      runId: 'run-cross-asset',
      strategyVersionId: 'strategy-cross-asset',
      snapshotId: 'snapshot-cross-asset',
      strategy: crossAssetStrategy,
      runConfig: runConfigSchemaV3.parse({
        ...runConfig,
        initialCash: { CNY: '20000' },
      }),
      rows,
      artifacts: [signalRef, executionRef, calendarRef, instrumentRef],
      engineVersion: 'runner-v2',
      marketRuleVersion: 'rules-v1',
      calendarVersion: 'calendar-v1',
      aggregationVersion: 'aggregation-v1',
    });

    expect(result.rejects).toEqual([]);
    expect(result.fills.map((fill) => fill.side)).toEqual(['buy', 'sell']);
    expect(result.trades).toHaveLength(1);
  });
});

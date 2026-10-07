import { runConfigSchemaV3, strategySchema, type BacktestStrategy } from '@thesis-ledger/schemas';
import type { ArtifactRef, ArtifactRow } from '../../src/backtest/backtest-artifact-store.js';

export const artifact = (key: string): ArtifactRef => ({
  artifactId: key,
  key,
  format: 'parquet',
  compression: 'zstd',
  contentHash: `${key}:hash`,
  sizeBytes: 1,
});

export const frozenExecutionRules = (
  overrides: {
    version?: string;
    maxDownRatio?: string;
    status?: 'supported' | 'unavailable';
  } = {},
) =>
  JSON.stringify(
    overrides.status === 'unavailable'
      ? { status: 'unavailable', reason: '历史市场规则覆盖不完整' }
      : {
          status: 'supported',
          version: overrides.version ?? 'rules-v1',
          range: { start: '2026-01-01', end: '2026-12-31' },
          price: {
            reference: 'previousClose',
            maxUpRatio: '0.2',
            maxDownRatio: overrides.maxDownRatio ?? '0.2',
          },
          positionSettlement: { sellableAfterTradingDays: 1 },
          cashSettlement: { buyDebitAfterTradingDays: 0, sellCreditAfterTradingDays: 1 },
          statutoryCharges: [{ code: 'fixture-levy', side: 'buy', rate: '0.001', minimum: null }],
        },
  );

export const exchangeExecutionModel = () => ({
  schemaVersion: 'execution-model-v1' as const,
  id: 'cn-exchange-runner-test',
  version: '1',
  scope: {
    symbol: '600519.SH',
    market: 'CN' as const,
    instrumentType: 'STOCK' as const,
    currency: 'CNY' as const,
    timezone: 'Asia/Shanghai',
    range: { start: '2026-09-08', end: '2026-09-11' },
  },
  segments: [
    {
      id: 'cn-exchange-2026',
      range: { start: '2026-09-08', end: '2026-09-11' },
      source: {
        kind: 'researchPreset' as const,
        description: '受控 Server Runner 模型消费测试',
        references: ['test-fixture'],
        revision: '1',
        configuredAt: '2026-09-10T00:00:00+08:00',
      },
      assumptions: ['仅用于验证冻结模型驱动的闭合买卖'],
      fees: {
        currency: 'CNY' as const,
        rounding: { mode: 'halfUp' as const, decimalPlaces: 2 as const },
        collection: 'perFillPerCharge' as const,
        commission: {
          treatment: 'charged' as const,
          side: 'both' as const,
          basis: 'turnover' as const,
          currency: 'CNY' as const,
          rate: '0.0003',
          minimum: { kind: 'amount' as const, amount: '5' },
        },
        stampDuty: {
          treatment: 'charged' as const,
          side: 'sell' as const,
          basis: 'turnover' as const,
          currency: 'CNY' as const,
          rate: '0.0005',
          minimum: { kind: 'none' as const },
        },
        transferFee: {
          treatment: 'charged' as const,
          side: 'both' as const,
          basis: 'turnover' as const,
          currency: 'CNY' as const,
          rate: '0.00001',
          minimum: { kind: 'none' as const },
        },
        regulatoryFee: { treatment: 'includedInCommission' as const, reason: '已包含' },
        handlingFee: { treatment: 'includedInCommission' as const, reason: '已包含' },
      },
      execution: {
        mode: 'exchange' as const,
        calendarMarket: 'CN' as const,
        reserveCashAt: 'orderAccepted' as const,
        buyDebitAt: 'fill' as const,
        sellableAfterTradingDays: 1,
        saleReinvestableAfterTradingDays: 0,
        price: {
          kind: 'dailyLimit' as const,
          reference: 'previousRawClose' as const,
          maxUpRatio: '0.1',
          maxDownRatio: '0.1',
          rounding: 'halfUpToTick' as const,
          minimumDistanceTicks: 1,
          minimumPriceTicks: 1,
        },
      },
    },
  ],
});

export const strategy = strategySchema.parse({
  schemaVersion: '2',
  name: 'NAV sequential runtime',
  signalSources: [
    {
      id: 'nav',
      asset: { symbol: '110011.OF', market: 'CN', assetType: 'fund' },
      timeframe: '1d',
      series: ['nav'],
    },
  ],
  executionInstrument: { symbol: '110011.OF', market: 'CN', assetType: 'fund' },
  primaryTimeframe: '1d',
  entry: {
    type: 'compare',
    operator: 'gt',
    left: { type: 'series', sourceId: 'nav', field: 'nav' },
    right: { type: 'constant', value: '1' },
  },
  exit: { type: 'positionState', field: 'isOpen' },
  sizing: { type: 'fixedQuantity', quantity: '1' },
  risk: [],
  execution: { mode: 'nav', requestTypes: ['subscribe', 'redeem'], timing: 'nextAvailableNav' },
  cost: { commissionRate: '0', slippageRate: '0' },
}) as BacktestStrategy;

export const runConfig = runConfigSchemaV3.parse({
  schemaVersion: '3',
  executionPriceProtocol: {
    protocolVersion: 'execution-price-v1',
    priceBasis: {
      adjustment: 'none',
      method: 'provider-native',
      methodVersion: 'provider-reported-v1',
      basisScope: 'provider-defined',
      anchor: null,
      revision: {
        origin: 'local-observation',
        contentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
      observedAt: '2024-01-01T00:00:00.000Z',
      quantityBasis: 'actual-units',
      volumeBasis: 'original',
      dividendMeaning: 'explicit-cash',
      dividendEvidenceRef: null,
      conversionAvailable: false,
      conversionEvidenceRef: null,
      derivation: null,
    },
    accountingBasis: 'raw-events',
    history: { basis: 'point-in-time', reconstructionEvidenceRef: 'original-bar-availability-v1' },
  },
  startDate: '2026-09-08',
  endDate: '2026-09-11',
  dataAsOf: '2026-09-12T00:00:00Z',
  baseCurrency: 'CNY',
  initialCash: { CNY: '1000' },
  valuationPolicy: {
    baseTimezone: 'Asia/Shanghai',
    dailyValuationTime: '15:00',
    pricePolicy: 'latestAvailable',
    fxPolicy: 'latestAvailable',
  },
});

export const runConfigV3 = (
  config: typeof runConfig,
  accountingBasis: 'raw-events' | 'normalized-series',
  executionModel?: unknown,
) =>
  runConfigSchemaV3.parse({
    ...config,
    ...(executionModel === undefined ? {} : { executionModel }),
    executionPriceProtocol: {
      protocolVersion: 'execution-price-v1',
      priceBasis: {
        adjustment: accountingBasis === 'raw-events' ? 'none' : 'qfq',
        method: 'provider-native',
        methodVersion: 'fixture-v1',
        basisScope: 'provider-defined',
        anchor: null,
        revision: { origin: 'provider', id: 'fixture-revision' },
        observedAt: '2026-09-12T00:00:00Z',
        quantityBasis: accountingBasis === 'raw-events' ? 'actual-units' : 'normalized-units',
        volumeBasis: 'unknown',
        dividendMeaning: accountingBasis === 'raw-events' ? 'explicit-cash' : 'provider-defined',
        dividendEvidenceRef: null,
        conversionAvailable: false,
        conversionEvidenceRef: null,
        derivation: null,
      },
      accountingBasis,
      history:
        accountingBasis === 'raw-events'
          ? { basis: 'point-in-time', reconstructionEvidenceRef: 'fixture-reconstruction' }
          : { basis: 'fixed-provider-snapshot' },
    },
  });

export const normalizedExecutionModel = () => {
  const model = exchangeExecutionModel();
  return {
    ...model,
    segments: model.segments.map((segment) => ({
      ...segment,
      execution: {
        ...segment.execution,
        price: {
          kind: 'noDailyLimit' as const,
          reason: '归一化连续价格坐标不沿用原始价格限制',
        },
        normalizedExecution: {
          priceCoordinate: 'continuous-decimal' as const,
          quantityUnits: 'continuous-normalized-decimal' as const,
          lotSizeConstraint: 'not-applied' as const,
          tickSizeConstraint: 'not-applied' as const,
          dailyPriceLimit: 'not-applied' as const,
          feeBasis: 'simulatedTurnover' as const,
        },
      },
    })),
  };
};

export const navFactTuples = [
  ['2026-09-08', '10', '2026-09-08T07:00:00Z', '2026-09-09T01:00:00Z'],
  ['2026-09-09', '10', '2026-09-09T07:00:00Z', '2026-09-10T01:00:00Z'],
  ['2026-09-10', '10', '2026-09-10T07:00:00Z', '2026-09-11T01:00:00Z'],
] satisfies readonly (readonly [string, string, string, string])[];

export const navRows: ArtifactRow[] = navFactTuples.map(
  ([valuationDate, nav, occurredAt, availableAt]) => ({
    symbol: '110011.OF',
    market: 'CN',
    instrumentType: 'NAV_FUND',
    valuationDate,
    nav,
    occurredAt,
    availableAt,
    provider: 'fixture',
    providerRevision: `nav-${valuationDate}`,
    freshness: 'delayed',
    quality: 'complete',
    status: 'supported',
  }),
);

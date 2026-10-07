import { backtestNavRunConfigV3Schema } from '@thesis-ledger/schemas';
import { describe, expect, it, vi } from 'vitest';
import {
  ThesisLedgerApiClient,
  ThesisLedgerContractError,
  type BacktestNavPreparationRequestV3,
  type BacktestNavRunCreateV3,
} from '../src/index.js';

const runId = '00000000-0000-4000-8000-000000000001';
const strategyVersionId = '00000000-0000-4000-8000-000000000002';
const preparationId = '00000000-0000-4000-8000-000000000003';
const hash = 'a'.repeat(64);
const symbol = '161725.OF';

const navExecutionModel = () => ({
  schemaVersion: 'execution-model-v1',
  id: 'nav-model',
  version: '1',
  scope: {
    symbol,
    market: 'CN',
    instrumentType: 'NAV_FUND',
    currency: 'CNY',
    timezone: 'Asia/Shanghai',
    range: { start: '2025-01-02', end: '2025-01-03' },
  },
  segments: [
    {
      id: 'nav-2025',
      range: { start: '2025-01-02', end: '2025-01-03' },
      source: {
        kind: 'researchPreset',
        description: 'transport test model',
        references: ['fixture://fee-model'],
        revision: '1',
        configuredAt: '2025-01-01T00:00:00.000Z',
      },
      assumptions: ['confirmed NAV execution model'],
      fees: null,
      execution: {
        mode: 'nav',
        calendarMarket: 'CN',
        cutoffLocalTime: '14:00',
        cutoffBoundary: 'atOrAfterNextTradingDay',
        navDate: 'acceptedApplicationTradingDate',
        navAvailability: 'providerAvailableAt',
        reserveCashAt: 'orderAccepted',
        subscriptionDebitAt: 'confirmation',
        confirmationAfterTradingDays: 1,
        sellableAfterConfirmationTradingDays: 1,
        redemptionReinvestableAfterConfirmationTradingDays: 2,
        subscriptionFee: {
          treatment: 'charged',
          side: 'buy',
          basis: 'subscriptionApplicationAmount',
          currency: 'CNY',
          rate: '0.01',
          minimum: { kind: 'none' },
          rounding: { mode: 'halfUp', decimalPlaces: 2 },
          collection: 'perApplication',
          collectedAt: 'confirmation',
        },
        redemptionFee: {
          treatment: 'charged',
          side: 'sell',
          basis: 'redemptionGrossProceeds',
          currency: 'CNY',
          rate: '0.01',
          minimum: { kind: 'none' },
          rounding: { mode: 'halfUp', decimalPlaces: 2 },
          collection: 'perApplication',
          collectedAt: 'confirmation',
        },
      },
    },
  ],
});

const runConfig = backtestNavRunConfigV3Schema.parse({
  schemaVersion: '3',
  startDate: '2025-01-02',
  endDate: '2025-01-03',
  dataAsOf: '2025-01-08T00:00:00.000Z',
  baseCurrency: 'CNY',
  initialCash: { CNY: '10000' },
  valuationPolicy: {
    baseTimezone: 'Asia/Shanghai',
    dailyValuationTime: '20:00',
    pricePolicy: 'latestAvailable',
    fxPolicy: 'latestAvailable',
  },
  executionModel: navExecutionModel(),
  navInput: { kind: 'nav', symbol },
  navVisibility: {
    mode: 'research-assumption',
    boundary: 'after-disclosure-day-end',
    timezone: 'Asia/Shanghai',
    disclosureCalendarHash: hash,
    rule: {
      id: 'rule',
      version: '1',
      symbol,
      fundType: 'domestic',
      applicableRange: { startDate: '2025-01-02', endDate: '2025-01-03' },
      delayWorkdays: 1,
      basis: 'domestic-default',
      evidenceRef: 'fixture://rule',
      documentHash: hash,
      contentHash: hash,
      configuredAt: '2025-01-01T00:00:00.000Z',
    },
  },
});

const runResponse = {
  contractVersion: 3 as const,
  schemaVersion: '3' as const,
  inputKind: 'nav' as const,
  id: runId,
  strategyVersionId,
  preparationId,
  preparationHash: hash,
  idempotencyKey: 'nav-run-transport',
  status: 'queued' as const,
  stage: 'queued',
  progress: 0,
  periodStart: '2025-01-02T00:00:00.000Z',
  periodEnd: '2025-01-03T00:00:00.000Z',
  dataAsOf: runConfig.dataAsOf,
  runConfig,
  executionAttempt: 0,
  snapshotId: null,
  snapshotManifest: null,
  errorCode: null,
  errorSummary: null,
  createdAt: '2025-01-08T00:00:00.000Z',
  updatedAt: '2025-01-08T00:00:00.000Z',
  startedAt: null,
  finishedAt: null,
  engineVersion: null,
  resultChecksum: null,
  result: null,
};

const runSummary = {
  contractVersion: 3 as const,
  inputKind: 'nav' as const,
  id: runId,
  strategyVersionId,
  symbol,
  status: 'queued' as const,
  stage: 'queued',
  progress: 0,
  periodStart: '2025-01-02T00:00:00.000Z',
  periodEnd: '2025-01-03T00:00:00.000Z',
  errorCode: null,
  errorSummary: null,
  createdAt: '2025-01-08T00:00:00.000Z',
  updatedAt: '2025-01-08T00:00:00.000Z',
};

const preparationRequest: BacktestNavPreparationRequestV3 = {
  contractVersion: 3,
  requestId: 'nav-preparation-transport',
  strategyVersionId,
  runConfig: {
    schemaVersion: '3',
    startDate: '2025-01-02',
    endDate: '2025-01-03',
    baseCurrency: 'CNY',
    initialCash: { CNY: '10000' },
    valuationPolicy: runConfig.valuationPolicy,
    executionModel: navExecutionModel(),
    navInput: { kind: 'nav', symbol },
  },
  fundType: 'domestic',
  visibilityMode: 'research-assumption',
  freezeTimePolicy: 'after-acquisition',
  calendarDecisionRaw: JSON.stringify({
    schemaVersion: 'nav-research-calendar-decision-v1',
    symbol,
    basis: 'nav-dates-xshg-intersection-v1',
    configuredAt: '2025-01-01T00:00:00.000Z',
    decision: 'Use the explicitly supplied calendar decision.',
  }),
  domesticRuleDecisionRaw: JSON.stringify({
    schemaVersion: 'nav-research-default-v1',
    symbol,
    fundType: 'domestic',
    delayWorkdays: 1,
    applicableRange: { startDate: '2025-01-02', endDate: '2025-01-03' },
    configuredAt: '2025-01-01T00:00:00.000Z',
    decision: 'Use the explicitly supplied T+1 research assumption.',
  }),
};

const createRequest: BacktestNavRunCreateV3 = {
  contractVersion: 3,
  preparationId,
  preparationHash: hash,
  idempotencyKey: 'nav-run-transport',
};

const blockedPreparation = {
  contractVersion: 3,
  requestId: preparationRequest.requestId,
  checkedAt: '2025-01-08T00:00:00.000Z',
  scope: 'nav-input-plan',
  status: 'blocked',
  diagnostics: [{ code: 'DATA_UNAVAILABLE', severity: 'error', message: 'Missing NAV inputs.' }],
};

describe('NAV 回测传输客户端', () => {
  it.each(['getNavRun', 'retryNavRun', 'cancelNavRun'] as const)(
    '%s 拒绝响应串用其他 Run',
    async (operation) => {
      const client = new ThesisLedgerApiClient(
        'https://thesis-ledger.test/api/v1',
        vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(runResponse))),
      );
      await expect(
        client.backtests[operation]('00000000-0000-4000-8000-000000000099'),
      ).rejects.toBeInstanceOf(ThesisLedgerContractError);
    },
  );
  it('准备请求使用 NAV 专属路由，保留原始决策并严格解析响应', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(blockedPreparation)));
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);

    expect(await client.backtests.prepareNavRunConfig(preparationRequest)).toEqual(
      blockedPreparation,
    );
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe('https://thesis-ledger.test/api/v1/backtests/run-config/nav/prepare');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual(preparationRequest);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('创建与读取通过 NAV 严格响应合同解析结果字段', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(runResponse)))
      .mockResolvedValueOnce(new Response(JSON.stringify(runResponse)));
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);

    expect(await client.backtests.createNavRun(createRequest)).toEqual(runResponse);
    expect(await client.backtests.getNavRun(runId)).toEqual(runResponse);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      'https://thesis-ledger.test/api/v1/backtests/runs/nav',
    );
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual(createRequest);
    expect(String(fetcher.mock.calls[1]?.[0])).toBe(
      `https://thesis-ledger.test/api/v1/backtests/runs/nav/${runId}`,
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('按独立 NAV 历史路由读取严格摘要列表', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify([runSummary])));
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);

    expect(await client.backtests.listNavRuns()).toEqual([runSummary]);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      'https://thesis-ledger.test/api/v1/backtests/runs/nav',
    );
    expect(fetcher.mock.calls[0]?.[1]?.method).toBeUndefined();
  });

  it('拒绝旧版完整 Run 摘要作为 NAV 历史列表项', async () => {
    const client = new ThesisLedgerApiClient(
      'https://thesis-ledger.test/api/v1',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([runResponse]))),
    );

    await expect(client.backtests.listNavRuns()).rejects.toBeInstanceOf(ThesisLedgerContractError);
  });

  it.each(['cancelNavRun', 'retryNavRun'] as const)(
    '%s 使用独立 NAV 生命周期路由',
    async (operation) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify(runResponse)));
      const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);

      expect(await client.backtests[operation](runId)).toEqual(runResponse);
      const [url, init] = fetcher.mock.calls[0]!;
      expect(String(url)).toBe(
        `https://thesis-ledger.test/api/v1/backtests/runs/nav/${runId}/${operation === 'cancelNavRun' ? 'cancel' : 'retry'}`,
      );
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({});
    },
  );

  it('拒绝不符合 NAV Run 合同的创建响应', async () => {
    const client = new ThesisLedgerApiClient(
      'https://thesis-ledger.test/api/v1',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify({ ...runResponse, inputKind: 'exchange' }))),
    );
    await expect(client.backtests.createNavRun(createRequest)).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
  });
});

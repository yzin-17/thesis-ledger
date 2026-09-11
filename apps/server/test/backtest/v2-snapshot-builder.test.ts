import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  BacktestCapabilities,
  BacktestExecutionModel,
  StrategySchemaV2,
} from '@thesis-ledger/schemas';
import { LocalSnapshotRunner } from '../../src/backtest/backtest-v2-runner.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';

const temporaryDirectories: string[] = [];

const fixture = async <T>(name: string): Promise<T> =>
  JSON.parse(
    await readFile(
      new URL(`../../../../packages/schemas/fixtures/${name}`, import.meta.url),
      'utf8',
    ),
  ) as T;

const runConfig = {
  startDate: '2024-01-02',
  endDate: '2024-01-03',
  dataAsOf: '2026-09-09T08:45:00Z',
  baseCurrency: 'CNY' as const,
  initialCash: { CNY: '1000000' },
  valuationPolicy: {
    baseTimezone: 'Asia/Shanghai',
    dailyValuationTime: '15:00',
    pricePolicy: 'latestAvailable' as const,
    fxPolicy: 'latestAvailable' as const,
  },
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('DsaSnapshotBuilder dependency-scoped facts', () => {
  it.each([
    ['supported', false],
    ['unavailable', false],
    ['supported', true],
    ['unavailable', true],
    ['rulesUnavailable', false],
    ['rulesUnavailable', true],
    ['currencyMismatch', true],
    ['calendarMismatch', true],
  ] as const)(
    'freezes only with required instrument facts: %s, model=%s',
    async (instrumentStatus, withModel) => {
      const root = await mkdtemp(join(tmpdir(), 'backtest-v2-builder-'));
      temporaryDirectories.push(root);
      const strategyFixture = await fixture<StrategySchemaV2>('backtest-v2.exchange.json');
      const strategy = { ...strategyFixture, signalSources: [strategyFixture.signalSources[0]!] };
      const capabilities = await fixture<BacktestCapabilities>('backtest-v2.capabilities.json');
      const selectedConfig = withModel
        ? {
            ...runConfig,
            executionModel: await fixture<BacktestExecutionModel>(
              'backtest-execution-model.cn-2024q1.json',
            ),
          }
        : runConfig;
      const instrumentFact = {
        symbol: '600519.SH',
        market: 'CN' as const,
        instrumentType: 'STOCK' as const,
        currency: 'CNY' as const,
        lotSize: '100',
        tickSize: '0.01',
        tradable: true,
        executionRules: {
          status: 'supported' as const,
          version: 'market-rules-v1',
          range: { start: '2023-12-09', end: '2024-01-03' },
          price: {
            reference: 'previousClose' as const,
            maxUpRatio: '0.1',
            maxDownRatio: '0.1',
          },
          positionSettlement: { sellableAfterTradingDays: 1 },
          cashSettlement: {
            buyDebitAfterTradingDays: 0,
            sellCreditAfterTradingDays: 1,
          },
          statutoryCharges: [],
        },
        provider: 'cn-market-rules',
        providerRevision: 'cn-stock-v1',
        occurredAt: '2020-01-01T00:00:00Z',
        availableAt: '2020-01-01T00:00:00Z',
      };
      const dsa = {
        backtestCapabilities: vi.fn().mockResolvedValue(capabilities),
        backtestBars: vi.fn().mockResolvedValue([
          {
            symbol: '600519.SH',
            market: 'CN',
            timeframe: '1d',
            occurredAt: '2024-01-02T07:00:00Z',
            availableAt: '2024-01-02T07:00:00Z',
            open: '10',
            high: '11',
            low: '9',
            close: '10.5',
            volume: '1000',
            provider: 'akshare',
            providerRevision: 'bars-v1',
            quality: 'complete',
          },
        ]),
        backtestCalendar: vi.fn().mockResolvedValue({
          version: 2,
          status: 'supported',
          provider: 'exchange-calendars',
          providerRevision: 'exchange-calendars-4',
          coverage: { start: '2023-12-25', end: '2024-01-03', complete: true },
          facts: [
            {
              market: 'CN',
              timezone: 'Asia/Shanghai',
              provider: 'exchange-calendars',
              providerRevision: 'exchange-calendars-4',
              availableAt: '2024-01-01T00:00:00Z',
              sessions: [
                { startMinute: 570, endMinute: 690 },
                { startMinute: 780, endMinute: 900 },
              ],
              sessionOverrides: [],
              holidays: ['2024-01-01'],
              range: { start: '2023-12-25', end: '2024-01-03' },
            },
          ],
        }),
        backtestInstrumentFacts: vi.fn().mockResolvedValue({
          version: 2,
          status: 'supported',
          provider: 'cn-market-rules',
          providerRevision: 'cn-stock-v1',
          coverage: { start: null, end: null, complete: true },
          facts: [instrumentFact],
        }),
        backtestCorporateActions: vi.fn().mockResolvedValue({
          version: 2,
          status: 'supported',
          provider: 'akshare',
          providerRevision: 'akshare-corporate-actions-v1',
          coverage: { start: '2023-12-25', end: '2024-01-03', complete: true },
          facts: [],
          reason: null,
        }),
      } as unknown as DsaClient;
      const builder = new DsaSnapshotBuilder(dsa, new LocalSnapshotStore(root));

      const unavailableRulesReason = '缺少覆盖请求历史区间的价格限制、法定收费与结算规则事实';
      if (instrumentStatus === 'rulesUnavailable') {
        vi.mocked(dsa.backtestInstrumentFacts).mockResolvedValue({
          version: 2,
          status: 'supported',
          provider: 'cn-market-rules',
          providerRevision: 'cn-stock-v1',
          coverage: { start: null, end: null, complete: true },
          facts: [
            {
              ...instrumentFact,
              executionRules: { status: 'unavailable', reason: unavailableRulesReason },
            },
          ],
        });
      }

      if (
        instrumentStatus !== 'supported' &&
        !(instrumentStatus === 'rulesUnavailable' && withModel)
      ) {
        let reason =
          '600519.SH 2023-12-09..2024-01-03: historicalTradability: Provider 未提供历史状态';
        if (instrumentStatus === 'rulesUnavailable') {
          reason = unavailableRulesReason;
        } else if (instrumentStatus === 'calendarMismatch' && 'executionModel' in selectedConfig) {
          selectedConfig.executionModel.scope.timezone = 'UTC';
          reason = '冻结 Calendar 时区与研究模型不一致';
        } else if (instrumentStatus === 'currencyMismatch') {
          reason = 'Provider 标的事实与研究模型适用范围不一致';
          vi.mocked(dsa.backtestInstrumentFacts).mockResolvedValue({
            version: 2,
            status: 'supported',
            provider: 'controlled',
            providerRevision: '1',
            coverage: { start: '2023-12-09', end: '2024-01-03', complete: true },
            facts: [{ ...capabilities.instrumentFacts[0]!, currency: 'USD' }],
          });
        } else
          vi.mocked(dsa.backtestInstrumentFacts).mockResolvedValue({
            version: 2,
            status: 'unavailable',
            provider: 'dsa-market-rules',
            providerRevision: 'static-lot-tick',
            coverage: { start: '2023-12-09', end: '2024-01-03', complete: false },
            facts: [],
            reason,
          });
        await expect(
          builder.build({
            runId: '11111111-1111-4111-8111-111111111111',
            strategyVersionId: '22222222-2222-4222-8222-222222222222',
            strategyVersionHash: 'strategy-hash',
            strategy,
            runConfig: selectedConfig,
          }),
        ).rejects.toMatchObject({ code: 'MARKET_RULES_UNAVAILABLE', message: reason });
        expect(
          await new LocalSnapshotStore(root).load('11111111-1111-4111-8111-111111111111', true),
        ).toBeUndefined();
        return;
      }

      const result = await builder.build({
        runId: '11111111-1111-4111-8111-111111111111',
        strategyVersionId: '22222222-2222-4222-8222-222222222222',
        strategyVersionHash: 'strategy-hash',
        strategy,
        runConfig: selectedConfig,
      });

      expect(result.manifest.status).toBe('finalized');
      expect(
        result.artifactRefs.some((artifact) => artifact.key.includes('empty-corporateActions')),
      ).toBe(true);
      expect(dsa.backtestCorporateActions).toHaveBeenCalledOnce();
      expect(dsa.backtestInstrumentFacts).toHaveBeenCalledWith({
        symbol: '600519.SH',
        market: 'CN',
        instrumentType: 'STOCK',
        start: result.manifest.dateRange.warmupStartDate,
        end: runConfig.endDate,
        executionStart: runConfig.startDate,
        executionEnd: runConfig.endDate,
        dataAsOf: runConfig.dataAsOf,
      });
      if (withModel) {
        expect(result.manifest.manifestVersion).toBe('snapshot-manifest-v2');
        expect(result.manifest.executionModel?.version).toBe('1');
        expect(await new LocalSnapshotStore(root).replay(result.manifest.runId)).toEqual(
          result.manifest,
        );
        const modelRun = await new LocalSnapshotRunner(new LocalSnapshotStore(root)).run(
          {
            runId: result.manifest.runId,
            snapshotRef: result.snapshotRef,
            artifactRefs: result.artifactRefs,
          },
          new AbortController().signal,
        );
        expect(modelRun.snapshotId).toBe(result.manifest.contentHash);
        expect(modelRun.executionModelDisclosure).toEqual({
          model: 'executionModel' in selectedConfig ? selectedConfig.executionModel : undefined,
          contentHash: result.manifest.executionModel?.contentHash,
        });
        expect(modelRun.rejectedOrders).toEqual([]);
        const hashes = [];
        for (const variation of ['same', 'fee', 'source']) {
          const nextRoot = await mkdtemp(join(tmpdir(), 'backtest-model-hash-'));
          temporaryDirectories.push(nextRoot);
          const config = structuredClone(selectedConfig);
          if (!('executionModel' in config)) throw new Error('测试模型缺失');
          if (variation === 'fee')
            config.executionModel.segments[0]!.fees!.commission.rate = '0.0004';
          if (variation === 'source')
            config.executionModel.segments[0]!.source.description += '修订来源说明';
          const next = await new DsaSnapshotBuilder(dsa, new LocalSnapshotStore(nextRoot)).build({
            runId: result.manifest.runId,
            strategyVersionId: result.manifest.strategyVersionId,
            strategyVersionHash: 'strategy-hash',
            strategy,
            runConfig: config,
          });
          hashes.push(next.manifest.contentHash);
        }
        expect(hashes[0]).toBe(result.manifest.contentHash);
        expect(hashes[1]).not.toBe(hashes[0]);
        expect(hashes[2]).not.toBe(hashes[0]);
        vi.mocked(dsa.backtestCapabilities).mockRejectedValue(new Error('重放禁止取数'));
        expect(
          (
            await builder.build({
              runId: result.manifest.runId,
              strategyVersionId: result.manifest.strategyVersionId,
              strategyVersionHash: 'strategy-hash',
              strategy,
              runConfig: selectedConfig,
            })
          ).manifest.contentHash,
        ).toBe(result.manifest.contentHash);
      } else {
        expect(result.manifest.manifestVersion).toBe('snapshot-manifest-v1');
        expect(result.manifest.executionModel).toBeUndefined();
      }
    },
  );

  it('rejects an empty corporate-action response without complete coverage', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backtest-v2-builder-'));
    temporaryDirectories.push(root);
    const strategyFixture = await fixture<StrategySchemaV2>('backtest-v2.exchange.json');
    const strategy = { ...strategyFixture, signalSources: [strategyFixture.signalSources[0]!] };
    const capabilities = await fixture<BacktestCapabilities>('backtest-v2.capabilities.json');
    const dsa = {
      backtestCapabilities: vi.fn().mockResolvedValue(capabilities),
      backtestBars: vi.fn().mockResolvedValue([]),
      backtestCalendar: vi.fn(),
      backtestInstrumentFacts: vi.fn(),
      backtestCorporateActions: vi.fn().mockResolvedValue({
        version: 2,
        status: 'unavailable',
        provider: 'akshare',
        providerRevision: 'akshare-corporate-actions-v1',
        coverage: { start: '2023-12-25', end: '2024-01-03', complete: false },
        facts: [],
        reason: 'Provider 未确认公司行动覆盖完整性',
      }),
    } as unknown as DsaClient;
    const builder = new DsaSnapshotBuilder(dsa, new LocalSnapshotStore(root));

    await expect(
      builder.build({
        runId: '33333333-3333-4333-8333-333333333333',
        strategyVersionId: '44444444-4444-4444-8444-444444444444',
        strategyVersionHash: 'strategy-hash',
        strategy,
        runConfig,
      }),
    ).rejects.toThrow('Provider 未确认公司行动覆盖完整性');
  });
});

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  backtestInstrumentFactsResponseSchema,
  indicatorCalculateResponseSchema,
  type ArenaHistoryMinutes,
  type BarPoint,
  type BarSeriesIdentity,
} from '@thesis-ledger/schemas';
import { MarketArenaHistorySource } from '../../src/market/market-arena-history-source.js';
import { MarketArenaReplayReader } from '../../src/market/market-arena-replay-reader.js';
import { liveProtocolFixture } from '../model-arena/live-fixture.js';

// 显式提供既有私有回执；普通单元测试不依赖兄弟仓库或本地真实记录。
const receiptPath = process.env.ARENA_HISTORY_OFFLINE_RECEIPT;
const dsaRoot = resolve(
  process.env.ARENA_HISTORY_OFFLINE_DSA_ROOT ?? '../../../daily-stock-analysis',
);
const python = (request: unknown): unknown =>
  JSON.parse(
    execFileSync(
      resolve(dsaRoot, '.venv/bin/python'),
      [resolve('test/market/fixtures/arena-history-offline.py')],
      {
        cwd: dsaRoot,
        input: JSON.stringify(request),
        encoding: 'utf8',
        timeout: 60000,
        env: {
          ...process.env,
          PYTHONPATH: dsaRoot,
          PYTHONDONTWRITEBYTECODE: '1',
          THESIS_LEDGER_FIXTURE_MODE: 'false',
        },
      },
    ),
  );

describe.skipIf(!receiptPath)('既有隔离回执的跨运行时离线验证', () => {
  const load = () => {
    const receipt = JSON.parse(readFileSync(receiptPath!, 'utf8'));
    const bundle = receipt.bundle as {
      observedAt: string;
      toolResults: Array<{
        request: { name: string };
        outcome: {
          data?: {
            identity: BarSeriesIdentity;
            points: BarPoint[];
          };
        };
      }>;
    };
    const bars = bundle.toolResults.find((r) => r.request.name === 'bars')!.outcome.data!;
    const protocol = liveProtocolFixture({
      market: 'CN' as const,
      currency: 'CNY',
      timeZone: 'Asia/Shanghai',
      universe: 'fixed',
      instruments: [
        {
          instrumentId: '11111111-1111-4111-8111-111111111111',
          symbol: bars.identity.symbol,
          assetType: 'ETF',
        },
      ],
    });
    // 输入是已投影的冻结点；按 interval-end 注入，避免再次平移历史时间。
    const history: ArenaHistoryMinutes = {
      contractVersion: 1,
      consumer: 'thesis-ledger',
      requestId: 'offline',
      kind: 'reconstructed-minutes',
      providerId: 'futu',
      policyRevision: 200,
      date: '2026-11-10',
      archiveRef: `arena-history/${'a'.repeat(64)}.json`,
      value: {
        symbol: bars.identity.symbol,
        assetType: 'ETF',
        market: 'CN',
        source: 'futu',
        timezone: 'Asia/Shanghai',
        timeframe: '5m',
        session: 'regular',
        timestampConvention: 'interval-end',
        observedAt: '2026-11-16T00:00:00.000Z',
        responseSha256: 'a'.repeat(64),
        fieldUnits: { volume: 'share', amount: 'CNY' },
        rows: bars.points.map((point) => ({
          timestamp: point.timestamp,
          open: point.open,
          high: point.high,
          low: point.low,
          close: point.close,
          volume: point.volume!,
          amount: point.amount!,
          complete: point.completionStatus === 'complete',
        })),
      },
    };
    return { bundle, bars, protocol, history };
  };

  it.each(['MA', 'MACD'] as const)(
    '原样本 %s 的旧指纹拒绝、新输入通过实际 DSA 纯计算',
    async (indicator) => {
      const { bundle, protocol, history } = load();
      let checked = false;
      const source = new MarketArenaHistorySource({
        arenaHistoryMinutes: vi.fn(async () => history),
        calculateIndicators: async (input) => {
          const legacy = createHash('sha256')
            .update(JSON.stringify({ identity: input.identity, points: input.points }))
            .digest('hex');
          expect(
            python({
              mode: 'indicators',
              legacy: true,
              payload: { contractVersion: 1, ...input, inputFingerprint: legacy },
            }),
          ).toMatchObject({ rejected: true });
          const result = indicatorCalculateResponseSchema.parse(
            python({ mode: 'indicators', payload: { contractVersion: 1, ...input } }),
          );
          checked = true;
          return result;
        },
      });
      const result = await source.research(protocol, bundle.observedAt, {
        symbol: '588000.SH',
        timeframe: '5m',
        limit: 10,
        indicator,
      });
      expect(checked).toBe(true);
      if (!('results' in result)) throw Error('应返回计算结果');
      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.name).toBe(indicator);
      expect(result.results[0]!.points).toHaveLength(10);
      const last = result.results[0]!.points.at(-1)!.values;
      if (indicator === 'MA') {
        expect(last.ma5).toBeTypeOf('number');
        expect(last.ma60).toBeNull();
      } else {
        expect(Object.values(last).every((value) => value === null)).toBe(true);
      }
      console.info(
        JSON.stringify({
          indicator,
          inputFingerprint: result.inputFingerprint,
          points: result.results[0]!.points.length,
          last: result.results[0]!.points.at(-1),
        }),
      );
    },
    60000,
  );

  it('同日盘中事实拒绝先于日状态与价格限制；可交易性完整也不会补出执行制度', async () => {
    const { bundle, protocol, bars, history } = load();
    const result = python({
      mode: 'rules',
      arguments: {
        symbol: '588000.SH',
        market: 'CN',
        instrument_type: 'ETF',
        data_as_of: bundle.observedAt,
        start: '2026-11-10',
        end: '2026-11-10',
        execution_start: '2026-11-10',
        execution_end: '2026-11-10',
        fixture_facts: [],
      },
    }) as {
      actual: {
        facts: Array<{
          tradable: boolean;
          lotSize: string;
          tickSize: string;
          executionRules: unknown;
        }>;
        missingInputs: Array<{ field: string; reason: string }>;
      };
      controlledTradability: {
        facts: Array<{ tradable: boolean; executionRules: unknown }>;
        missingInputs: Array<{ field: string }>;
      };
    };
    expect(result.actual.facts[0]).toMatchObject({
      lotSize: '100',
      tickSize: '0.001',
      tradable: false,
      executionRules: { status: 'unavailable' },
    });
    expect(result.actual.missingInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'historicalTradability',
          reason: expect.stringContaining('dataAsOf 早于'),
        }),
        expect.objectContaining({
          field: 'executionRules',
          reason: expect.stringContaining('价格限制、法定收费与结算'),
        }),
      ]),
    );
    expect(result.controlledTradability.facts[0]).toMatchObject({
      tradable: true,
      executionRules: { status: 'unavailable' },
    });
    expect(result.controlledTradability.missingInputs.map((r) => r.field)).toEqual([
      'executionRules',
    ]);
    const statuses = { readComposition: vi.fn() },
      actions = { read: vi.fn() };
    const scope = backtestInstrumentFactsResponseSchema.parse(result.actual);
    const reader = new MarketArenaReplayReader(
      {
        read: vi.fn(async () => ({
          status: 'ready' as const,
          calendar: {
            market: 'CN' as const,
            timezone: 'Asia/Shanghai',
            revision: 'offline-controlled',
            availableAt: '2026-01-01T00:00:00.000Z',
            coverageStart: '2026-10-01',
            coverageEnd: '2026-12-01',
            sessions: [
              {
                tradingDate: '2026-11-10',
                startAt: '2026-11-10T05:00:00.000Z',
                endAt: '2026-11-10T07:00:00.000Z',
              },
            ],
          },
        })),
      },
      { readRetainedResearch: vi.fn() },
      { backtestInstrumentFacts: vi.fn(async () => scope) },
      statuses,
      actions,
      {
        resolve: vi.fn(async () => protocol.instruments.map((i) => ({ ...i, name: i.symbol }))),
        prices: vi.fn(async () => ({
          points: [
            {
              ...bars.points.at(-1)!,
              timestamp: bundle.observedAt,
              availableAt: bundle.observedAt,
            },
          ],
          evidence: {
            kind: history.kind,
            archiveRef: history.archiveRef,
            observedAt: history.value.observedAt,
            responseSha256: history.value.responseSha256,
            providerId: history.providerId,
            policyRevision: history.policyRevision,
            timestampConvention: history.value.timestampConvention,
          },
          seriesVersion: 'offline-controlled',
        })),
      },
    );
    await expect(reader.observe(protocol, bundle.observedAt, ['588000.SH'])).rejects.toThrow(
      'replay_rules_unavailable',
    );
    expect(statuses.readComposition).not.toHaveBeenCalled();
    expect(actions.read).not.toHaveBeenCalled();
    console.info(
      JSON.stringify({
        actual: result.actual.missingInputs,
        controlledTradability: result.controlledTradability.missingInputs,
      }),
    );
  }, 60000);
});

import { describe, expect, it, vi } from 'vitest';
import { backtestRunPreparationRequestV3Schema, runConfigSchemaV3 } from '@thesis-ledger/schemas';
import { lifecycleResponseFixtureV3 } from '../market/lifecycle-response.fixture.js';
import {
  deriveLifecyclePreparationV3,
  lifecycleInputHashV3,
} from '../../src/backtest/backtest-lifecycle-preparation-v3.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { makeReaderResult } from './v3-snapshot-fixtures.js';
import { deriveFrozenMarketWindowViewV3 } from '../../src/market/market-frozen-window-view-v3.js';
import { prepareBacktestRunConfigV3 } from '../../src/backtest/backtest-run-preparation.js';

const bars = ['2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21', '2026-05-22'].map((date) => ({
  timestamp: date + 'T00:00:00Z',
}));
const receipt = (ipo: string | null, required = 2) =>
  deriveLifecyclePreparationV3({
    response: lifecycleResponseFixtureV3('000995.SZ', '2026-05-01', '2026-05-22', ipo),
    bars,
    start: '2026-05-10',
    end: '2026-05-22',
    required,
    priceResponseHash: 'b'.repeat(64),
  });
describe('生命周期保留原预热、请求范围与独立来源', () => {
  it('上市后积累原数量才开始信号，不补零或修改IPO', () => {
    const result = receipt('2026-05-18');
    expect(result.signalStartDate).toBe('2026-05-20');
    expect(result.requiredWarmupBars).toBe(2);
    expect(result.response.range.start).toBe('2026-05-01');
    expect(result.response.basicLifecycle?.ipoDate).toBe('2026-05-18');
  });
  it('窗口内预热始终不足明确拒绝，零预热仍从真实上市Bar开始', () => {
    expect(() => receipt('2026-05-18', 5)).toThrow('始终不足');
    expect(receipt('2026-05-18', 0).signalStartDate).toBe('2026-05-18');
  });
  it('IPO未知不得凭第一条价格延迟起点，生命周期内来源缺失不伪装上市前', () => {
    expect(() => receipt(null)).toThrow('上市日未知');
    expect(() => receipt('2000-01-01')).toThrow('来源缺失');
  });
  it('未知IPO但原起点前实际预热足够时保留原起点，已知停牌不计入预热', () => {
    const response = lifecycleResponseFixtureV3('000995.SZ', '2026-05-01', '2026-05-22', null);
    const value = deriveLifecyclePreparationV3({
      response,
      bars,
      start: '2026-05-20',
      end: '2026-05-22',
      required: 2,
      priceResponseHash: 'b'.repeat(64),
    });
    expect(value.signalStartDate).toBe('2026-05-20');
    const changed = lifecycleResponseFixtureV3(
      '000995.SZ',
      '2026-05-01',
      '2026-05-22',
      '2026-05-18',
    );
    // 条件分区测试不伪造生产状态；本处只测试 helper 对已知停牌的计数。
    changed.sourceDocuments = [
      {
        id: 'halt',
        title: '受控停牌事实',
        url: 'https://example.test/halt',
        publishedDate: null,
        kind: 'issuerDisclosure',
      },
    ];
    Object.assign(
      changed.days.find((day) => day.date === '2026-05-19')!,
      { state: 'suspended', sourceDocumentIds: ['halt'] },
    );
    changed.structuredCoverage!.statusUnknownDates =
      changed.structuredCoverage!.statusUnknownDates.filter((date) => date !== '2026-05-19');
    const halted = deriveLifecyclePreparationV3({
      response: changed,
      bars,
      start: '2026-05-10',
      end: '2026-05-22',
      required: 2,
      priceResponseHash: 'b'.repeat(64),
    });
    expect(halted.signalStartDate).toBe('2026-05-21');
  });
  it('实际源输入变化影响指纹，单纯包装请求号不影响', () => {
    const value = receipt('2026-05-18');
    const changed = structuredClone(value.response);
    changed.requestId = 'another';
    changed.provenance.fetchedAt = '2026-06-02T00:00:00Z';
    expect(lifecycleInputHashV3(changed)).toBe(value.inputHash);
    changed.basicLifecycle!.ipoDate = '2026-05-19';
    expect(lifecycleInputHashV3(changed)).not.toBe(value.inputHash);
  });
  it('真实准备链保留请求区间，先完整取价再做冻结Reader预热检查', async () => {
    const f = await completeSnapshotFixture();
    const config = f.input.runConfig;
    f.input.strategy.executionInstrument = {
      market: 'CN',
      symbol: '000995.SZ',
      assetType: 'stock',
    };
    f.input.strategy.signalSources.forEach(
      (source) => (source.asset = f.input.strategy.executionInstrument),
    );
    f.input.executionRouteKey.assetType = 'STOCK';
    config.executionModel!.scope.instrumentType = 'STOCK';
    config.executionModel!.scope.symbol = '000995.SZ';
    config.endDate = '2026-05-29';
    config.dataAsOf = '2026-06-01T00:00:00Z';
    config.executionModel!.scope.range.end = config.endDate;
    config.executionModel!.segments.forEach((segment) => (segment.range.end = config.endDate));
    const request = backtestRunPreparationRequestV3Schema.parse({
      contractVersion: 3,
      requestId: 'life-prepare',
      strategyVersionId: '11111111-1111-4111-8111-111111111111',
      adjustment: 'qfq',
      accountingBasis: 'normalized-series',
      history: { basis: 'fixed-provider-snapshot' },
      lifecycleResearch: 'listed-bars-warmup-v1',
      runConfig: {
        startDate: config.startDate,
        endDate: config.endDate,
        dataAsOf: config.dataAsOf,
        baseCurrency: config.baseCurrency,
        initialCash: config.initialCash,
        valuationPolicy: config.valuationPolicy,
        executionModel: config.executionModel,
      },
    });
    const ipo = config.startDate;
    const lifecycle = {
      read: vi.fn(async (scope: { symbol: string; start: string; end: string }) =>
        lifecycleResponseFixtureV3(scope.symbol, scope.start, scope.end, ipo),
      ),
    };
    let parent: Awaited<ReturnType<typeof makeReaderResult>>;
    f.reader.readV3.mockImplementation(async (input) => {
      if (input.frozenWindowRef && parent?.status === 'selected') {
        const view = deriveFrozenMarketWindowViewV3(
          {
            request: parent.request,
            response: parent.selection.response,
            evidence: parent.evidence,
            completeResponseHash: parent.evidence.completeResponseHash,
          } as never,
          input.frozenWindowRef,
          input,
        );
        return {
          ...parent,
          request: view.request,
          selection: { ...parent.selection, response: view.response },
          seriesVersion: view.seriesVersion,
          evidence: { ...parent.evidence, seriesVersion: view.seriesVersion },
          frozenWindowRef: input.frozenWindowRef,
        };
      }
      const missing: string[] = [];
      for (
        let date = new Date(`${input.window.start}T00:00:00Z`);
        date.toISOString().slice(0, 10) < ipo;
        date.setUTCDate(date.getUTCDate() + 1)
      )
        missing.push(date.toISOString().slice(0, 10));
      parent = await makeReaderResult(input, false, missing, true);
      return parent;
    });
    const control = {
      getPolicy: vi.fn(async () => ({
        contractVersion: 3,
        consumer: 'thesis-ledger',
        requestId: 'policy',
        revision: 7,
        enabled: true,
        syncState: 'applied',
        effectiveStale: false,
        routes: [
          {
            key: f.input.executionRouteKey,
            targets: [{ providerId: 'hithink', upstreamSource: 'hithink-financial-api' }],
          },
        ],
      })),
    };
    const result = await prepareBacktestRunConfigV3({
      request,
      strategy: f.input.strategy,
      reader: f.reader,
      control: control as never,
      lifecycle,
      checkedAt: '2026-06-01T00:00:00Z',
    });
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
    expect(result.runConfig.startDate).toBe(config.startDate);
    expect(result.runConfig.lifecyclePreparation!.signalStartDate > config.startDate).toBe(true);
    expect(f.reader.readV3.mock.calls[0]![0].warmup).toBeUndefined();
    expect(f.reader.readV3.mock.calls[1]![0].warmup?.analysisStart).toBe(
      result.runConfig.lifecyclePreparation!.signalStartDate,
    );
    const invalid = structuredClone(result.runConfig);
    invalid.lifecyclePreparation!.priceResponseHash = 'c'.repeat(64);
    expect(runConfigSchemaV3.safeParse(invalid).success).toBe(false);
  });
});

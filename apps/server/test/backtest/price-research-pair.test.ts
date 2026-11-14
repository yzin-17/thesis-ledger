import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { prepareBacktestRunConfigV3 } from '../../src/backtest/backtest-run-preparation.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';
import { priceResearchFixture } from './price-research.fixtures.js';
import { backtestRunPreparationResultV3Schema } from '@thesis-ledger/schemas';

const prepare = (f: Awaited<ReturnType<typeof priceResearchFixture>>) =>
  prepareBacktestRunConfigV3({
    request: f.request,
    strategy: f.input.strategy,
    control: f.control,
    reader: f.reader,
    checkedAt: '2026-06-07T08:00:00Z',
  });
const researchSource = { providerId: 'futu', upstreamSource: 'futu' };

describe('双价格的独立来源选择', () => {
  it.each([0, 1])(
    '原价按自身路由选择索引 %s，后复权来源保持不变并能离线重放',
    async (routeIndex) => {
      const actualSource = { providerId: 'tushare', upstreamSource: 'tushare', routeIndex };
      const f = await priceResearchFixture({ researchSource, actualSource });
      const policy = structuredClone(await f.control.getPolicy());
      const prepared = await prepare(f);
      expect(prepared.status, JSON.stringify(prepared)).toBe('prepared');
      if (prepared.status !== 'prepared') throw Error('准备未通过');
      expect(prepared.actualSource.provenance).toMatchObject({ ...researchSource, routeIndex: 0 });
      expect(prepared.actualPriceSource?.provenance).toMatchObject(actualSource);
      const legacy = { ...prepared };
      delete legacy.actualPriceSource;
      expect(backtestRunPreparationResultV3Schema.safeParse(legacy).success).toBe(true);
      expect(backtestRunPreparationResultV3Schema.safeParse({ ...prepared, actualPriceSource: {
        ...prepared.actualPriceSource, symbol: '000001.SZ',
      } }).success).toBe(false);
      expect(f.reader.readV3.mock.calls.map(([input]) => input.routeKey.adjustment)).toEqual([
        'hfq',
        'none',
      ]);
      expect(f.reader.readV3.mock.calls[1]?.[0]).not.toHaveProperty('requiredSource');
      const root = await mkdtemp(join(tmpdir(), 'independent-price-sources-'));
      try {
        const snapshots = new LocalSnapshotStore(root);
        const output = await new DsaSnapshotBuilder(f.dsa as never, snapshots, f.reader).buildV3({
          ...f.input,
          runConfig: prepared.runConfig,
          executionRouteKey: { ...f.input.executionRouteKey, adjustment: 'hfq' },
        });
        expect(
          output.manifest.actualSources.find((source) => source.purpose === 'execution')
            ?.provenance,
        ).toMatchObject(researchSource);
        expect(output.manifest.priceResearch?.actualPriceSource?.provenance).toMatchObject(
          actualSource,
        );
        const referenceReads = f.reader.readV3.mock.calls.filter(
          ([input]) => input.routeKey.adjustment === 'none',
        );
        expect(referenceReads.at(-1)?.[0].frozenWindowRef).toEqual(
          prepared.runConfig.priceResearch?.actualPriceWindow,
        );
        f.reader.readV3.mockRejectedValue(new Error('offline'));
        const result = await new LocalSnapshotV3Runner(snapshots).run(
          {
            runId: f.input.runId,
            snapshotRef: output.snapshotRef,
            artifactRefs: output.artifactRefs,
          },
          new AbortController().signal,
        );
        expect(result.simulationFills[0]).toMatchObject({
          quantity: '50',
          actualReferencePrice: expect.any(String),
        });
        expect(result.priceResearch?.actualPriceSource?.provenance).toMatchObject(actualSource);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
      expect(await f.control.getPolicy()).toEqual(policy);
    },
  );

  it.each(['route_not_configured', 'primary_unavailable'] as const)(
    '原价 %s 时直接报原价问题，不整体重取后复权',
    async (reason) => {
      const f = await priceResearchFixture({ researchSource });
      const read = f.reader.readV3.getMockImplementation()!;
      f.reader.readV3.mockImplementation(async (input) => {
        if (input.routeKey.adjustment === 'none')
          return {
            status: 'unavailable',
            selection: {
              status: 'unavailable',
              reason,
              ...(reason === 'primary_unavailable'
                ? { primaryFailure: 'fetch_failed', backupFailure: 'missing_window' }
                : {}),
            },
          } as never;
        return read(input);
      });
      const prepared = await prepare(f);
      expect(prepared.status).toBe('blocked');
      expect(JSON.stringify(prepared)).toContain(
        reason === 'route_not_configured' ? reason : 'fetch_failed',
      );
      expect(JSON.stringify(prepared)).not.toContain('futu/futu');
      expect(f.reader.readV3.mock.calls.map(([input]) => input.routeKey.adjustment)).toEqual([
        'hfq',
        'none',
      ]);
    },
  );

  it.each(['symbol', 'market', 'window'] as const)(
    '不同源仍拒绝原价 %s 与计划不匹配',
    async (field) => {
      const f = await priceResearchFixture({ researchSource });
      const read = f.reader.readV3.getMockImplementation()!;
      f.reader.readV3.mockImplementation(async (input) => {
        const selected = await read(input);
        if (input.routeKey.adjustment === 'none') {
          if (field === 'symbol') selected.request.symbol = '000001.SZ';
          else if (field === 'market')
            selected.request.routeKey = { ...selected.request.routeKey, market: 'HK' };
          else selected.request.start = '2026-01-01';
        }
        return selected;
      });
      expect((await prepare(f)).status).toBe('blocked');
    },
  );
});

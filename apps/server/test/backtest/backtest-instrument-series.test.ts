import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { backtestSnapshotManifestV3Schema, runConfigSchemaV3 } from '@thesis-ledger/schemas';
import { BacktestInstrumentSeriesService } from '../../src/backtest/backtest-instrument-series.service.js';
import {
  ArtifactNotFoundError,
  ArtifactCorruptionError,
  type ArtifactRow,
} from '../../src/backtest/backtest-artifact-store.js';
import { runConfig, normalizedExecutionModel } from './v2-execution.fixtures.js';

const id = '00000000-0000-4000-8000-000000000080';
const saved = JSON.parse(
  readFileSync(
    new URL(
      '../../../../packages/schemas/fixtures/backtest-snapshot-v3.manifest.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const manifest = backtestSnapshotManifestV3Schema.parse({
  ...saved,
  runId: id,
  artifacts: [{ ...saved.artifacts[0], key: `${id}/execution/bars.parquet` }],
});
const model = normalizedExecutionModel();
const range = { start: '2026-05-18', end: '2026-05-20' };
const config = runConfigSchemaV3.parse({
  ...runConfig,
  startDate: '2026-05-18',
  endDate: '2026-05-20',
  dataAsOf: manifest.dataAsOf,
  executionPriceProtocol: manifest.executionPriceProtocol,
  executionModel: {
    ...model,
    scope: { ...model.scope, range, symbol: '159516.SZ', instrumentType: 'ETF' },
    segments: model.segments.map((segment) => ({ ...segment, range })),
  },
});
const source = manifest.actualSources.find((item) => item.purpose === 'execution')!;
const key = source.routeKey as {
  market: string;
  assetType: string;
  timeframe: string;
  adjustment: string;
};
const row = (date: string, close: string | null): ArtifactRow => ({
  kind: 'market-bar-v3',
  purpose: 'execution',
  symbol: source.symbol,
  market: key.market,
  assetType: key.assetType,
  timeframe: key.timeframe,
  adjustment: key.adjustment,
  ...source.provenance,
  inputFingerprint: source.inputFingerprint,
  completionStatus: 'complete',
  quality: 'complete',
  occurredAt: `${date}T07:00:00.000Z`,
  availableAt: `${date}T07:00:00.000Z`,
  close,
});
const setup = (rows: ArtifactRow[] = [row('2026-05-18', '1.1234567890123456789')]) => {
  const job = {
    id,
    result: {},
    snapshotId: manifest.contentHash,
    snapshotManifest: manifest,
    runConfig: config,
    readEligibility: { state: 'readable' },
  };
  const read = vi.fn().mockResolvedValue(job);
  const openRead = vi.fn().mockImplementation(async () =>
    (async function* () {
      yield* rows;
    })(),
  );
  const service = new BacktestInstrumentSeriesService(
    { currentRunForRead: read } as never,
    { artifacts: { openRead } } as never,
  );
  return { job, read, openRead, service };
};
describe('冻结标的序列', () => {
  it('新Run走势图按已发布的attempt位置读取冻结产物', async () => {
    const h = setup();
    const forAttempt = vi.fn(() => ({ artifacts: { openRead: h.openRead } }));
    h.read.mockResolvedValue({ ...h.job, input: { snapshotStorageAttempt: 2 }, executionAttempt: 3 });
    const service = new BacktestInstrumentSeriesService({ currentRunForRead: h.read } as never,
      { forAttempt, artifacts: { openRead: vi.fn(() => { throw new Error('must not read legacy path'); }) } } as never);
    expect(await service.read(id)).toMatchObject({ status: 'available' });
    expect(forAttempt).toHaveBeenCalledWith(id, 2);
  });
  it('读取精确冻结来源、过滤预热和区间外点、排序并保留十进制与缺值', async () => {
    const rows = [
      row('2026-05-20', null),
      row('2026-05-17', '1'),
      row('2026-05-18', '1.1234567890123456789'),
      row('2026-05-21', '3'),
    ];
    const original = structuredClone(rows);
    const { service, openRead, read } = setup(rows);
    const result = await service.read(id);
    expect(read).toHaveBeenCalledWith(id);
    expect(openRead).toHaveBeenCalledWith(manifest.artifacts[0]);
    expect(result).toMatchObject({
      status: 'available',
      runId: id,
      source: {
        symbol: source.symbol,
        adjustment: key.adjustment,
        snapshotId: manifest.contentHash,
      },
      points: [
        { occurredAt: '2026-05-18T07:00:00.000Z', close: '1.1234567890123456789' },
        { occurredAt: '2026-05-20T07:00:00.000Z', close: null },
      ],
    });
    expect(rows).toEqual(original);
  });
  it('先执行结果门禁，受限或未知读取资格不访问产物', async () => {
    for (const state of ['restricted', 'unknown']) {
      const { service, job, openRead } = setup();
      job.readEligibility.state = state;
      await expect(service.read(id)).rejects.toMatchObject({ status: 403 });
      expect(openRead).not.toHaveBeenCalled();
    }
  });
  it.each([
    { providerId: 'other' },
    { adjustment: 'hfq' },
    { inputFingerprint: 'other' },
    { availableAt: '2099-01-01T00:00:00Z' },
    { occurredAt: '2026-05-18' },
    { availableAt: '2026-05-18' },
    { close: 'invalid' },
  ])('来源与口径不匹配或值无效时不返回价格：%j', async (fault) => {
    const { service } = setup([{ ...row('2026-05-18', '1'), ...fault }]);
    expect(await service.read(id)).toMatchObject({
      status: 'unavailable',
      reason: 'INTEGRITY_ERROR',
    });
  });
  it('区分文件缺失与损坏，并拒绝重复时点', async () => {
    for (const [error, reason] of [
      [new ArtifactNotFoundError('file'), 'ARTIFACT_UNAVAILABLE'],
      [new ArtifactCorruptionError('file', 'hash'), 'INTEGRITY_ERROR'],
    ] as const) {
      const { service, openRead } = setup();
      openRead.mockRejectedValue(error);
      expect(await service.read(id)).toMatchObject({ status: 'unavailable', reason });
    }
    expect(
      await setup([row('2026-05-18', '1'), row('2026-05-18', '2')]).service.read(id),
    ).toMatchObject({ status: 'unavailable', reason: 'INTEGRITY_ERROR' });
  });
});

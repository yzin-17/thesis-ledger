import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import { marketWindowSeriesVersionV3 } from '../../src/market/market-frozen-window-v3.js';
import { buildInput, makeReaderResult } from './v3-snapshot-fixtures.js';
import type { MarketBarWindowReadInputV3 } from '../../src/market/market-bar-reader-v3.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const fixture = async (strict: boolean) => {
  const root = await mkdtemp(join(tmpdir(), 'pit-freeze-'));
  roots.push(root);
  const { input } = await buildInput();
  input.runConfig.executionPriceProtocol.priceBasis.anchor = '2026-05-18';
  if (strict) input.runConfig.executionPriceProtocol.history = { basis: 'point-in-time', reconstructionEvidenceRef: 'nonempty-proof-ref' };
  const readV3 = vi.fn(async (request: MarketBarWindowReadInputV3) => {
    const result = await makeReaderResult(request);
    if (result.status !== 'selected') throw new Error('缺行情');
    result.selection.response.sourcePriceBasis.anchor = '2026-05-18';
    result.evidence.sourcePriceBasis = result.selection.response.sourcePriceBasis;
    result.seriesVersion = result.evidence.seriesVersion = marketWindowSeriesVersionV3(result.request, result.selection.response);
    return result;
  });
  const snapshots = new LocalSnapshotStore(root);
  const startBuild = vi.spyOn(snapshots.v3, 'startBuild');
  const putArtifact = vi.spyOn(snapshots.v3, 'putArtifact');
  const bindSourceTimes = vi.fn(async () => null);
  const builder = new DsaSnapshotBuilder({} as never, snapshots, { readV3 }, { bindSourceTimes });
  return { input, readV3, snapshots, startBuild, putArtifact, bindSourceTimes, builder };
};

describe('新 V3 Snapshot 历史证据写入门禁', () => {
  it('非空引用且已识别的价格输入仍不能绕过实际证据冻结', async () => {
    const f = await fixture(true);
    await expect(f.builder.buildV3(f.input)).rejects.toMatchObject({ code: 'DATA_UNAVAILABLE', missingFields: ['verifiedReconstructionEvidence'] });
    expect(f.bindSourceTimes).toHaveBeenCalledTimes(1);
    expect(f.startBuild).not.toHaveBeenCalled();
    expect(f.putArtifact).not.toHaveBeenCalled();
    expect(await f.snapshots.v3.load(f.input.runId, true)).toBeUndefined();
  });
  it('来源证据读取失败保留稳定错误，写入前退出', async () => {
    const f = await fixture(true);
    f.bindSourceTimes.mockRejectedValue(new Error('private-detail'));
    await expect(f.builder.buildV3(f.input)).rejects.toMatchObject({ code: 'DATA_UNAVAILABLE', missingFields: ['verifiedReconstructionEvidence'] });
    expect(f.startBuild).not.toHaveBeenCalled();
    expect(f.putArtifact).not.toHaveBeenCalled();
  });
  it('相同固定快照仍可冻结和重放，不读取重建服务', async () => {
    const f = await fixture(false);
    const result = await f.builder.buildV3(f.input);
    expect(result.manifest.status).toBe('finalized');
    expect(await f.snapshots.v3.replay(f.input.runId)).toEqual(result.manifest);
    expect(f.bindSourceTimes).not.toHaveBeenCalled();
  });
});

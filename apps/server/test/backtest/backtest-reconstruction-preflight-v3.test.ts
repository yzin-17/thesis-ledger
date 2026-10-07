import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runConfigSchemaV3 } from '@thesis-ledger/schemas';
import { MarketPitReconstructionRepository } from '../../src/market/market-pit-reconstruction.repository.js';
import { backtestHistoricalExecutionPreflightFailureV3 } from '../../src/backtest/backtest-reconstruction-preflight-v3.js';
import { pitReconstructionFixture } from '../market/pit-reconstruction-fixture.js';
import { buildInput } from './v3-snapshot-fixtures.js';

const config = vi.hoisted(() => ({
  marketPitReconstructionFile: '',
  marketPitReconstructionSha256: '',
}));
vi.mock('../../src/platform/config.js', () => ({ loadConfig: () => config }));
let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'pit-preflight-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
const fixture = async (partition: boolean) => {
  const f = await pitReconstructionFixture();
  if (partition) await f.partitionAtOriginalObservation();
  const text = JSON.stringify(f.proof);
  config.marketPitReconstructionFile = join(root, 'manifest.json');
  config.marketPitReconstructionSha256 = createHash('sha256').update(text).digest('hex');
  await writeFile(config.marketPitReconstructionFile, text);
  const history = {
    basis: 'point-in-time',
    reconstructionEvidenceRef: `market-pit-proof-v1:${config.marketPitReconstructionSha256}`,
  };
  const { input: snapshotInput } = await buildInput();
  const runConfig = runConfigSchemaV3.parse({
    schemaVersion: '3',
    startDate: f.input.request.start,
    endDate: f.input.request.end,
    dataAsOf: f.input.dataAsOf,
    baseCurrency: 'CNY',
    initialCash: { CNY: '100000' },
    executionModel: snapshotInput.runConfig.executionModel,
    valuationPolicy: {
      baseTimezone: 'Asia/Shanghai',
      dailyValuationTime: '15:00',
      pricePolicy: 'latestAvailable',
      fxPolicy: 'latestAvailable',
    },
    executionPriceProtocol: {
      protocolVersion: 'execution-price-v1',
      accountingBasis: 'normalized-series',
      priceBasis: { ...f.input.response.sourcePriceBasis, quantityBasis: 'normalized-units' },
      history,
    },
  });
  const repo = new MarketPitReconstructionRepository(f.windows);
  const bindSourceTimes = vi.spyOn(repo, 'bindSourceTimes');
  return {
    ...f,
    input: { ...f.input, fetchedAt: new Date(f.input.dataAsOf) },
    repo,
    bindSourceTimes,
    runConfig,
  };
};

describe('实际重建 repository 的预检消费边界', () => {
  it('原文、三个归档和来源时钟全部绑定，仍因缺独立历史决策窗口而阻断', async () => {
    const f = await fixture(true);
    const original = structuredClone(f.input);
    expect(
      await backtestHistoricalExecutionPreflightFailureV3(f.input, f.runConfig, f.repo),
    ).toMatchObject({ code: 'DATA_UNAVAILABLE', missingFields: ['historicalDecisionWindow'] });
    expect(f.findUnique).toHaveBeenCalledTimes(3);
    expect(f.bindSourceTimes).toHaveBeenCalledWith(
      f.input,
      f.runConfig.executionPriceProtocol.history.basis === 'point-in-time'
        ? f.runConfig.executionPriceProtocol.history.reconstructionEvidenceRef
        : '',
    );
    expect(f.input).toEqual(original);
    expect(f.runConfig.executionPriceProtocol.history.basis).toBe('point-in-time');
  });
  it.each(['arbitrary-ref', 'late-observation', 'archive-missing', 'manifest-revoked'] as const)(
    '拒绝 %s 取得 ready',
    async (kind) => {
      const f = await fixture(kind !== 'late-observation');
      if (kind === 'arbitrary-ref')
        f.runConfig.executionPriceProtocol.history = {
          basis: 'point-in-time',
          reconstructionEvidenceRef: 'nonempty-ref',
        };
      else if (kind === 'archive-missing') f.rows.clear();
      else if (kind === 'manifest-revoked') await rm(config.marketPitReconstructionFile);
      expect(
        await backtestHistoricalExecutionPreflightFailureV3(f.input, f.runConfig, f.repo),
      ).toMatchObject({
        code: 'DATA_UNAVAILABLE',
        missingFields: ['verifiedReconstructionEvidence'],
      });
    },
  );
  it('相同固定快照沿用真实冻结时钟，不请求重建服务', async () => {
    const f = await fixture(false);
    f.runConfig.executionPriceProtocol.history = { basis: 'fixed-provider-snapshot' };
    expect(
      await backtestHistoricalExecutionPreflightFailureV3(f.input, f.runConfig, f.repo),
    ).toBeNull();
    expect(f.bindSourceTimes).not.toHaveBeenCalled();
  });
  it('已发现冻结未来事实时先阻断，不读取重建清单', async () => {
    const f = await fixture(true);
    f.input.response.bars[0]!.availableAt = '2030-01-01T00:00:00Z';
    expect(
      await backtestHistoricalExecutionPreflightFailureV3(f.input, f.runConfig, f.repo),
    ).toMatchObject({ code: 'FUTURE_DATA' });
    expect(f.bindSourceTimes).not.toHaveBeenCalled();
  });
});

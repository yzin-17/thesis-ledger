import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { StrategyOptimizationRunService } from '../../src/strategy-optimization/strategy-optimization-run.service.js';
import { completeSnapshotFixture } from '../backtest/v3-complete-snapshot-fixtures.js';
import { preparationStampFor } from '../backtest/v3-preparation-fixtures.js';

const fixture = async () => {
  const f = await completeSnapshotFixture();
  const config = f.input.runConfig;
  const versionId = '11111111-1111-4111-8111-111111111111';
  const input = {
    contractVersion: 1,
    strategyVersionId: versionId,
    runConfig: config,
    preparationStamp: preparationStampFor(f.input.strategy, config, versionId),
    idempotencyKey: 'optimization:experiment:baseline:development',
  };
  const job = { id: 'run', status: 'succeeded' };
  const configured = { resolve: vi.fn().mockResolvedValue({ kind: 'prepared', input }) };
  const backtests = { createRun: vi.fn().mockResolvedValue(job) };
  const prisma = { $executeRaw: vi.fn() };
  const service = new StrategyOptimizationRunService(
    prisma as never,
    backtests as never,
    configured as never,
  );
  const reserve = vi.spyOn(service, 'reserveBudget').mockResolvedValue(undefined);
  const experiment = {
    id: 'experiment',
    runConfig: config,
    split: { development: { start: config.startDate, end: config.endDate } },
  };
  return { service, configured, backtests, reserve, experiment, versionId, input, job };
};

describe('优化分段运行版本分派', () => {
  it('新旧分析与完整引擎身份不混排，旧冻结数据指纹保持原值', async () => {
    const backtests = { comparableDataFingerprint: vi.fn().mockResolvedValue('frozen-data') };
    const service = new StrategyOptimizationRunService({} as never, backtests as never);
    const range = { start: '2026-01-01', end: '2026-01-31' };
    const legacy = { id: 'run', result: { engineVersion: 'old' } };
    expect(await service.dataArtifactFingerprint(legacy as never, range)).toBe('frozen-data');
    const current = { ...legacy, result: { analyticsVersion: 'research-analytics-v2', engineVersion: 'engine-5' } };
    const fingerprint = await service.dataArtifactFingerprint(current as never, range);
    expect(fingerprint).not.toBe('frozen-data');
    expect(await service.dataArtifactFingerprint(current as never, range)).toBe(fingerprint);
    expect(await service.dataArtifactFingerprint({ ...current, result: {
      ...current.result, engineVersion: 'engine-6',
    } } as never, range)).not.toBe(fingerprint);
  });
  it('旧运行配置在预检与预算申请前拒绝', async () => {
    const f = await fixture();
    const oldExperiment = {
      ...f.experiment,
      runConfig: { ...f.experiment.runConfig, schemaVersion: '2' },
    };
    await expect(
      f.service.executeRun(oldExperiment as never, f.versionId, 'development', 'baseline'),
    ).rejects.toThrow();
    expect(f.configured.resolve).not.toHaveBeenCalled();
    expect(f.reserve).not.toHaveBeenCalled();
    expect(f.backtests.createRun).not.toHaveBeenCalled();
  });

  it('V3使用本段预检的创建输入，预检后才申请预算', async () => {
    const f = await fixture();
    expect(
      await f.service.executeRun(f.experiment as never, f.versionId, 'development', 'baseline'),
    ).toEqual(f.job);
    expect(f.configured.resolve).toHaveBeenCalledWith(
      f.versionId,
      f.input.runConfig,
      f.input.idempotencyKey,
      { rebindStrategyInputs: true },
    );
    expect(f.backtests.createRun).toHaveBeenCalledWith(f.input);
    expect(f.configured.resolve.mock.invocationCallOrder[0]).toBeLessThan(
      f.reserve.mock.invocationCallOrder[0]!,
    );
    expect(f.reserve).toHaveBeenCalledOnce();
  });
  it('冻结协议不兼容时，不申请Run预算、不创建Run', async () => {
    const f = await fixture();
    f.configured.resolve.mockRejectedValue(new Error('冻结协议不兼容'));
    await expect(
      f.service.executeRun(f.experiment as never, f.versionId, 'development', 'baseline'),
    ).rejects.toThrow('冻结协议不兼容');
    expect(f.reserve).not.toHaveBeenCalled();
    expect(f.backtests.createRun).not.toHaveBeenCalled();
  });
  it('已有V3幂等Run不重复扣减预算或创建', async () => {
    const f = await fixture();
    f.configured.resolve.mockResolvedValue({ kind: 'existing', job: f.job });
    expect(
      await f.service.executeRun(f.experiment as never, f.versionId, 'development', 'baseline'),
    ).toEqual(f.job);
    expect(f.reserve).not.toHaveBeenCalled();
    expect(f.backtests.createRun).not.toHaveBeenCalled();
  });
});

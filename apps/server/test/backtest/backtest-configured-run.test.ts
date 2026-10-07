import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { BacktestConfiguredRunService } from '../../src/backtest/backtest-configured-run.service.js';
import { hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { preparedRevisionReader } from './v3-preparation-fixtures.js';

const versionId = '11111111-1111-4111-8111-111111111111';
const fixture = async () => {
  const f = await completeSnapshotFixture();
  const prisma = {
    backtestJob: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    strategyVersion: {
      findUnique: vi.fn().mockResolvedValue({ schemaVersion: 2, schema: f.input.strategy }),
    },
  };
  const revisions = preparedRevisionReader();
  const service = new BacktestConfiguredRunService(
    prisma as never,
    f.reader as never,
    revisions as never,
  );
  return { ...f, prisma, revisions, service };
};

describe('冻结V3配置的创建前预检', () => {
  it('候选更名信号时只替换别名，不改变冻结协议及其他配置', async () => {
    const f = await fixture();
    const original = structuredClone(f.input.runConfig);
    f.input.strategy.signalSources[0]!.id = 'renamed-close';
    f.input.strategy.entry = {
      type: 'compare', operator: 'gt',
      left: { type: 'series', sourceId: 'renamed-close', field: 'close' },
      right: { type: 'constant', value: '0' },
    };
    f.input.strategy.exit = { type: 'positionState', field: 'isOpen' };
    const resolved = await f.service.resolve(versionId, original, 'renamed-candidate', {
      rebindStrategyInputs: true,
    });
    expect(resolved.kind).toBe('prepared');
    if (resolved.kind !== 'prepared') throw new Error('fixture');
    expect(resolved.input.runConfig).toEqual({
      ...original,
      priceInputBindings: {
        signals: [{ sourceId: 'renamed-close', binding: 'execution-series' }],
        benchmark: { binding: 'execution-series' },
      },
    });
    expect(original).toEqual(f.input.runConfig);
    expect(f.prisma.backtestJob.create).not.toHaveBeenCalled();
  });

  it('候选移除信号时重建别名，保留冻结协议且不修改实验配置', async () => {
    const f = await fixture();
    f.input.strategy.entry = { type: 'positionState', field: 'isOpen' };
    f.input.strategy.exit = { type: 'not', expression: { type: 'positionState', field: 'isOpen' } };
    const original = structuredClone(f.input.runConfig);
    const resolved = await f.service.resolve(versionId, original, 'candidate', {
      rebindStrategyInputs: true,
    });
    expect(resolved.kind).toBe('prepared');
    if (resolved.kind !== 'prepared') throw new Error('fixture');
    expect(resolved.input.runConfig).toEqual({
      ...original,
      priceInputBindings: { signals: [], benchmark: { binding: 'execution-series' } },
    });
    expect(original).toEqual(f.input.runConfig);
    f.prisma.backtestJob.findFirst.mockResolvedValue({
      id: 'existing',
      mode: 'V3',
      runConfig: resolved.input.runConfig,
      input: { contractVersion: 3, schemaVersion: '3', runConfig: resolved.input.runConfig },
    });
    f.reader.readV3.mockClear();
    f.revisions.readCurrent.mockClear();
    const replay = await f.service.resolve(versionId, original, 'candidate', {
      rebindStrategyInputs: true,
    });
    expect(replay.kind).toBe('existing');
    expect(f.reader.readV3).not.toHaveBeenCalled();
    expect(f.revisions.readCurrent).not.toHaveBeenCalled();
    await expect(
      f.service.resolve(versionId, { ...original, initialCash: { CNY: '20000' } }, 'candidate', {
        rebindStrategyInputs: true,
      }),
    ).rejects.toThrow('幂等键');
  });

  it('候选跨标的信号不能变成执行价格别名', async () => {
    const f = await fixture();
    f.input.strategy.signalSources[0]!.asset.symbol = '510300.SH';
    await expect(
      f.service.resolve(versionId, f.input.runConfig, 'candidate', { rebindStrategyInputs: true }),
    ).rejects.toThrow('不同标的或周期');
    expect(f.reader.readV3).not.toHaveBeenCalled();
    expect(f.revisions.readCurrent).not.toHaveBeenCalled();
  });

  it('候选重建别名仍受已冻结预热预算约束', async () => {
    const f = await fixture();
    const config = {
      ...f.input.runConfig,
      frozenExecutionWindow: {
        version: 'market-frozen-window-v1',
        identityFingerprint: 'a'.repeat(64),
        responseHash: 'b'.repeat(64),
      },
      frozenWarmupBudgetSessions: 4,
    };
    await expect(
      f.service.resolve(versionId, config, 'candidate', { rebindStrategyInputs: true }),
    ).rejects.toThrow('超过实验已冻结');
    expect(f.reader.readV3).not.toHaveBeenCalled();
    expect(f.revisions.readCurrent).not.toHaveBeenCalled();
  });

  it('普通配置预检不替调用者修复错误绑定', async () => {
    const f = await fixture();
    const config = structuredClone(f.input.runConfig);
    config.priceInputBindings!.signals = [];
    await expect(f.service.resolve(versionId, config, 'ordinary')).rejects.toThrow('准确覆盖');
    expect(f.reader.readV3).not.toHaveBeenCalled();
  });

  it('绑定当前策略、区间和配置，保留原协议且不写入任务', async () => {
    const f = await fixture();
    const resolved = await f.service.resolve(versionId, f.input.runConfig, 'intent');
    expect(resolved.kind).toBe('prepared');
    if (resolved.kind !== 'prepared') throw new Error('fixture');
    expect(resolved.input.runConfig).toEqual(f.input.runConfig);
    expect(resolved.input.preparationStamp).toMatchObject({
      strategyVersionId: versionId,
      strategyContentHash: hashCanonicalManifest(f.input.strategy),
      runConfigChecksum: hashCanonicalManifest(f.input.runConfig),
      desiredRevision: 7,
      effectiveRevision: 1,
      catalogRevision: 12,
    });
    expect(f.prisma.backtestJob.create).not.toHaveBeenCalled();
  });
  it('来源修订与冻结协议不同不会自动更新协议', async () => {
    const f = await fixture();
    const config = structuredClone(f.input.runConfig);
    config.executionPriceProtocol.priceBasis.observedAt = '2000-01-01T00:00:00Z';
    await expect(f.service.resolve(versionId, config, 'intent')).rejects.toThrow(
      '当前行情不能复用冻结的运行协议',
    );
    expect(config.executionPriceProtocol.priceBasis.observedAt).toBe('2000-01-01T00:00:00Z');
    expect(f.prisma.backtestJob.create).not.toHaveBeenCalled();
  });
  it('既有幂等Run离线返回，配置变化仍拒绝', async () => {
    const f = await fixture();
    const job = {
      id: 'existing',
      mode: 'V3',
      runConfig: f.input.runConfig,
      input: { contractVersion: 3, schemaVersion: '3', runConfig: f.input.runConfig },
    };
    f.prisma.backtestJob.findFirst.mockResolvedValue(job);
    f.revisions.readCurrent.mockRejectedValue(new Error('offline'));
    expect(await f.service.resolve(versionId, f.input.runConfig, 'intent')).toEqual({
      kind: 'existing',
      job,
    });
    expect(f.revisions.readCurrent).not.toHaveBeenCalled();
    expect(f.reader.readV3).not.toHaveBeenCalled();
    expect(f.prisma.strategyVersion.findUnique).not.toHaveBeenCalled();
    await expect(
      f.service.resolve(
        versionId,
        { ...f.input.runConfig, initialCash: { CNY: '20000' } },
        'intent',
      ),
    ).rejects.toThrow('幂等键');
  });
  it('控制面查询失败阻断，不能冒充修订未变化', async () => {
    const f = await fixture();
    f.revisions.readCurrent.mockRejectedValue(new Error('offline'));
    await expect(f.service.resolve(versionId, f.input.runConfig, 'intent')).rejects.toThrow(
      'offline',
    );
    expect(f.reader.readV3).not.toHaveBeenCalled();
  });
});

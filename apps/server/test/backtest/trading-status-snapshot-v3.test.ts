import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  tradingStatusArtifactKeyV3,
  tradingStatusFreezeVersionV3,
  type MarketTradingStatusRequestV3,
} from '@thesis-ledger/schemas';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { LocalSnapshotStore, hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import {
  collectSnapshotTradingStatusV3,
  readSnapshotTradingStatusV3,
  tradingStatusArtifactRowsV3,
} from '../../src/backtest/backtest-trading-status-snapshot-v3.js';
import { tradingStatusInputs, tradingStatusRunConfig } from './trading-status-fixtures.js';

const directories: string[] = [];
afterEach(async () =>
  Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))),
);

const setup = async (failure: 'none' | 'primary' | 'all' = 'none', backup = false) => {
  const { response } = await tradingStatusInputs();
  const runConfig = await tradingStatusRunConfig();
  const marketTradingStatusV3 = vi.fn(async (request: MarketTradingStatusRequestV3) => {
    if (failure === 'all' || (failure === 'primary' && request.routeTarget.routeIndex === 0))
      throw new Error('模拟来源读取失败');
    return {
      ...response,
      ...request,
      provenance: {
        ...response.provenance,
        providerId: request.routeTarget.providerId,
        upstreamSource: request.routeTarget.upstreamSource,
      },
    };
  });
  const effectiveControlPolicyV3 = vi.fn(async () => ({
    projection: {
      effective: {
        enabled: true,
        routes: [
          {
            key: response.routeKey,
            targets: (backup ? [0, 1] : [0]).map((routeIndex) => ({
              ...response.routeTarget,
              ...(routeIndex === 1
                ? { providerId: 'test-status-backup', upstreamSource: 'test-cn-daily-suspension' }
                : {}),
              routeIndex,
              eligible: true,
              reason: null,
            })),
          },
        ],
      },
    },
  }));
  const dsa = { marketTradingStatusV3, effectiveControlPolicyV3 };
  const originalConfig = structuredClone(runConfig);
  const status = await collectSnapshotTradingStatusV3(runConfig, dsa as unknown as DsaClient);
  if (!status) throw new Error('测试范围未生成状态产物');
  return { runConfig, response, dsa, status, originalConfig };
};

describe('停复牌独立冻结接缝', () => {
  it('主源正常只读一次，unknown 不补读，原模型和价格协议身份保持', async () => {
    const { runConfig, response, dsa, status, originalConfig } = await setup('none', true);
    expect(dsa.marketTradingStatusV3).toHaveBeenCalledOnce();
    expect(dsa.marketTradingStatusV3.mock.calls[0]![0].range).toEqual(response.range);
    expect(runConfig).toEqual(originalConfig);
    expect(status.runConfigChecksum).toBe(hashCanonicalManifest(originalConfig));
    expect(status.disclosure.status).toBe('source');
    if (status.disclosure.status !== 'source') throw new Error('来源未选中');
    expect(status.disclosure.response.days).toEqual(response.days);
    expect(status.disclosure.response.provenance.historicalAvailability).toBe('notVerified');
    expect(status.disclosure.fallbackReason).toBeUndefined();
  });

  it('主源失败整窗使用备用，不拼接已知与未知状态', async () => {
    const { response, dsa, status } = await setup('primary', true);
    expect(dsa.marketTradingStatusV3.mock.calls.map(([request]) => request.range)).toEqual([
      response.range,
      response.range,
    ]);
    if (status.disclosure.status !== 'source') throw new Error('备用未选中');
    expect(status.disclosure.response.routeTarget.routeIndex).toBe(1);
    expect(status.disclosure.response.provenance.upstreamSource).toBe('test-cn-daily-suspension');
    expect(status.disclosure.response.days).toEqual(response.days);
    expect(status.disclosure.fallbackReason).toContain('整段区间');
  });

  it('不 eligible 的主源跳过，仅请求已配置备用', async () => {
    const { runConfig, dsa } = await setup('none', true);
    const policy = await dsa.effectiveControlPolicyV3();
    policy.projection.effective.routes[0]!.targets[0]!.eligible = false;
    dsa.effectiveControlPolicyV3.mockResolvedValue(policy);
    dsa.marketTradingStatusV3.mockClear();
    await collectSnapshotTradingStatusV3(runConfig, dsa as unknown as DsaClient);
    expect(dsa.marketTradingStatusV3).toHaveBeenCalledOnce();
    expect(dsa.marketTradingStatusV3.mock.calls[0]![0].routeTarget.routeIndex).toBe(1);
  });

  it('全部来源失败冻结未纳入原因，没有正常状态默认值', async () => {
    const { status, dsa } = await setup('all', true);
    expect(dsa.marketTradingStatusV3).toHaveBeenCalledTimes(2);
    expect(status.disclosure).toEqual({
      status: 'notIncluded',
      reason: '已配置停复牌源暂不可用，未纳入真实状态约束，沿用已选普通研究假设。',
    });
  });

  it('无读取能力、无路由或路由错误均记录原因，保持普通研究可用', async () => {
    const { runConfig, dsa } = await setup();
    expect((await collectSnapshotTradingStatusV3(runConfig))?.disclosure.status).toBe(
      'notIncluded',
    );
    const policy = await dsa.effectiveControlPolicyV3();
    policy.projection.effective.routes = [];
    dsa.effectiveControlPolicyV3.mockResolvedValue(policy);
    dsa.marketTradingStatusV3.mockClear();
    expect(
      (await collectSnapshotTradingStatusV3(runConfig, dsa as unknown as DsaClient))?.disclosure,
    ).toMatchObject({ status: 'notIncluded', reason: expect.stringContaining('未配置') });
    expect(dsa.marketTradingStatusV3).not.toHaveBeenCalled();
    dsa.effectiveControlPolicyV3.mockRejectedValue(new Error('策略不可用'));
    expect(
      (await collectSnapshotTradingStatusV3(runConfig, dsa as unknown as DsaClient))?.disclosure,
    ).toMatchObject({ status: 'notIncluded', reason: expect.stringContaining('路由暂不可用') });
  });

  it('范围外和严格 PIT 不请求未验证来源', async () => {
    const { runConfig, dsa } = await setup();
    dsa.marketTradingStatusV3.mockClear();
    dsa.effectiveControlPolicyV3.mockClear();
    runConfig.executionPriceProtocol.history = {
      basis: 'point-in-time',
      reconstructionEvidenceRef: 'test-pit-evidence',
    };
    expect(
      await collectSnapshotTradingStatusV3(runConfig, dsa as unknown as DsaClient),
    ).toBeUndefined();
    runConfig.executionPriceProtocol.history = { basis: 'fixed-provider-snapshot' };
    runConfig.executionModel!.scope.instrumentType = 'ETF';
    expect(
      await collectSnapshotTradingStatusV3(runConfig, dsa as unknown as DsaClient),
    ).toBeUndefined();
    expect(dsa.marketTradingStatusV3).not.toHaveBeenCalled();
    expect(dsa.effectiveControlPolicyV3).not.toHaveBeenCalled();
  });

  it('真实 Parquet 产物重复离线读取一致，重放不选源', async () => {
    const { status, runConfig, dsa } = await setup('primary', true);
    const root = await mkdtemp(join(tmpdir(), 'trading-status-snapshot-'));
    directories.push(root);
    const store = new LocalSnapshotStore(root);
    const artifact = await store.artifacts.put({
      key: `status-run/${tradingStatusArtifactKeyV3}`,
      rows: tradingStatusArtifactRowsV3(status),
    });
    const context = {
      runId: 'status-run',
      tradingStatus: {
        artifactKey: artifact.key,
        freezeVersion: tradingStatusFreezeVersionV3,
      },
    };
    dsa.marketTradingStatusV3.mockRejectedValue(new Error('离线禁止读取来源'));
    dsa.effectiveControlPolicyV3.mockRejectedValue(new Error('离线禁止选源'));
    const read = async () => {
      const rows = [];
      for await (const row of await store.artifacts.openRead(artifact)) rows.push(row);
      return readSnapshotTradingStatusV3(context, runConfig, rows);
    };
    expect(await read()).toEqual(status);
    expect(await read()).toEqual(status);
    expect(dsa.marketTradingStatusV3).toHaveBeenCalledTimes(2);
    expect(dsa.effectiveControlPolicyV3).toHaveBeenCalledOnce();
    await expect(
      store.artifacts.openRead({ ...artifact, contentHash: '0'.repeat(64) }),
    ).rejects.toThrow('content hash mismatch');
  });

  it('旧快照无引用维持原行为，冻结产物必须绑定原运行配置与标的窗口', async () => {
    const { status, runConfig } = await setup();
    const context = {
      runId: 'status-run',
      tradingStatus: {
        artifactKey: `status-run/${tradingStatusArtifactKeyV3}`,
        freezeVersion: tradingStatusFreezeVersionV3,
      },
    };
    const rows = tradingStatusArtifactRowsV3(status);
    expect(readSnapshotTradingStatusV3({ runId: context.runId }, runConfig, [])).toBeUndefined();
    expect(() => readSnapshotTradingStatusV3({ runId: context.runId }, runConfig, rows)).toThrow(
      '缺少快照引用',
    );
    expect(() => readSnapshotTradingStatusV3(context, runConfig, [])).toThrow('缺失');
    expect(() =>
      readSnapshotTradingStatusV3({ ...context, runId: 'other-run' }, runConfig, rows),
    ).toThrow('结构无效');
    const changed = structuredClone(runConfig);
    changed.initialCash.CNY = '9999';
    expect(() => readSnapshotTradingStatusV3(context, changed, rows)).toThrow('身份不一致');
    if (status.disclosure.status !== 'source') throw new Error('来源未冻结');
    status.disclosure.response.symbol = '600000.SH';
    expect(() =>
      readSnapshotTradingStatusV3(context, runConfig, tradingStatusArtifactRowsV3(status)),
    ).toThrow('标的或窗口');
    status.disclosure.response.symbol = '000995.SZ';
    status.disclosure.response.range.start = '2023-08-17';
    status.disclosure.response.days.shift();
    expect(() =>
      readSnapshotTradingStatusV3(context, runConfig, tradingStatusArtifactRowsV3(status)),
    ).toThrow('标的或窗口');
  });
});

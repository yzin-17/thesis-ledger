import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  tradingStatusArtifactKeyV3,
  tradingStatusFreezeVersionV3,
  backtestTradingStatusSnapshotV3Schema,
} from '@thesis-ledger/schemas';
import { LocalSnapshotStore, hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import {
  readSnapshotTradingStatusV3,
  tradingStatusArtifactRowsV3,
} from '../../src/backtest/backtest-trading-status-snapshot-v3.js';
import { collectSnapshotStatusInputsV1 } from '../../src/backtest/backtest-status-composition-v1.js';
import { compositionFixture } from '../market/status-composition-fixtures.js';
import { tradingStatusInputs, tradingStatusRunConfig } from './trading-status-fixtures.js';

const directories: string[] = [];
afterEach(async () =>
  Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))),
);

const setup = async () => {
  const { response } = await tradingStatusInputs();
  const runConfig = await tradingStatusRunConfig();
  const status = backtestTradingStatusSnapshotV3Schema.parse({
    freezeVersion: tradingStatusFreezeVersionV3,
    runConfigChecksum: hashCanonicalManifest(runConfig),
    disclosure: { status: 'source', response, fallbackReason: '历史采集采用整窗备用源。' },
  });
  return { runConfig, status };
};

describe('普通样本只走独立现行状态能力', () => {
  it('已有旧路由和未选独立路由时均不读旧状态', async () => {
    const runConfig = await tradingStatusRunConfig();
    const current = compositionFixture();
    const old = (await tradingStatusInputs()).response;
    current.readPolicy.mockResolvedValue({ ...current.policy,
      routes: [{ key: old.routeKey, targets: [{ ...old.routeTarget, eligible: true, reason: null }], reason: null }] });
    const actual = await collectSnapshotStatusInputsV1(runConfig, {
      effectiveControlPolicyV3: async () => ({ projection: { effective: await current.readPolicy() } }),
      dataCapabilities: current.reader,
    } as never);
    expect(actual).toEqual({ statusComposition: undefined, tradingStatus: undefined });
    expect(current.post).not.toHaveBeenCalled();
  });

  it('严格 PIT 与非股票仍保持独立能力不读取', async () => {
    const runConfig = await tradingStatusRunConfig();
    const current = compositionFixture();
    const dsa = {
      effectiveControlPolicyV3: async () => ({ projection: { effective: await current.readPolicy() } }),
      dataCapabilities: current.reader,
    } as never;
    runConfig.executionPriceProtocol.history = {
      basis: 'point-in-time', reconstructionEvidenceRef: 'test-pit-evidence',
    };
    expect((await collectSnapshotStatusInputsV1(runConfig, dsa)).statusComposition).toBeUndefined();
    runConfig.executionPriceProtocol.history = { basis: 'fixed-provider-snapshot' };
    runConfig.executionModel!.scope.instrumentType = 'ETF';
    expect((await collectSnapshotStatusInputsV1(runConfig, dsa)).statusComposition).toBeUndefined();
    expect(current.post).not.toHaveBeenCalled();
  });
});

describe('既有停复牌产物离线读取', () => {
  it('真实 Parquet 产物重复离线读取一致，重放不选源', async () => {
    const { status, runConfig } = await setup();
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
    const read = async () => {
      const rows = [];
      for await (const row of await store.artifacts.openRead(artifact)) rows.push(row);
      return readSnapshotTradingStatusV3(context, runConfig, rows);
    };
    expect(await read()).toEqual(status);
    expect(await read()).toEqual(status);
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

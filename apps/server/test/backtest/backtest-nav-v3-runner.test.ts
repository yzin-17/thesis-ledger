import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deterministicResultChecksum } from '@thesis-ledger/domain';
import { backtestExecutionResultV3Schema } from '@thesis-ledger/schemas';
import { LocalNavSnapshotStore } from '../../src/backtest/backtest-nav-snapshot-store.js';
import {
  LocalNavSnapshotV3Runner,
  type BacktestNavV3RunnerInput,
} from '../../src/backtest/backtest-nav-v3-runner.js';
import { verifyNavResultV3 } from '../../src/backtest/backtest-nav-result-v3.js';
import { navFreezeFixture } from './nav-freeze.fixtures.js';
import { navResearchFixture } from './nav-research.fixtures.js';
import { adaptNavDomainInputsV3 } from '../../src/backtest/backtest-nav-domain-input.js';
import { navOfflineHoldingPeriods } from '../../src/backtest/backtest-nav-offline-signals.js';
import { hashNavRaw } from '../../src/backtest/backtest-nav-freeze-validation.js';

let root: string;
let store: LocalNavSnapshotStore;
let input: BacktestNavV3RunnerInput;
const signal = () => new AbortController().signal;
beforeEach(async () => {
  root = await mkdtemp(resolve(tmpdir(), 'nav-v3-runner-'));
  store = new LocalNavSnapshotStore(root);
  const manifest = await store.freeze(navFreezeFixture());
  input = {
    runId: manifest.runId,
    snapshotRef: { snapshotId: manifest.contentHash, contentHash: manifest.contentHash },
    artifactRefs: [manifest.artifact, manifest.contextArtifact].map((ref) => ({
      ...ref,
      artifactId: ref.contentHash,
      key: `${manifest.runId}/${ref.key}`,
    })),
  };
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('现行 Runner 的 NAV 离线能力', () => {
  it('跨 UTC 日期的确认按基金本地日期计算持仓周期', async () => {
    const adapted = adaptNavDomainInputsV3(await store.replay(input.runId));
    expect(navOfflineHoldingPeriods(adapted, '2026-09-08T23:00:00Z', '2026-09-09')).toBe(1);
    expect(navOfflineHoldingPeriods(adapted, undefined, '2026-09-09')).toBe(0);
  });
  it('非估值日结束仍包含实际期末估值点，不延伸窗口', async () => {
    const fixture = navFreezeFixture('weekend-end');
    fixture.context.runConfig.endDate = '2026-09-12';
    fixture.facts = fixture.facts.filter((fact) => fact.valuationDate <= '2026-09-12');
    fixture.context.publicationRecords = fixture.context.publicationRecords.slice(
      0,
      fixture.facts.length,
    );
    fixture.context.responseRaw = JSON.stringify({
      records: fixture.context.publicationRecords.map((record) => JSON.parse(record.rawRecord)),
    });
    fixture.source.responseHash = hashNavRaw(fixture.context.responseRaw);
    const manifest = await store.freeze(fixture);
    const refs = [manifest.artifact, manifest.contextArtifact].map((ref) => ({
      ...ref,
      artifactId: ref.contentHash,
      key: `${manifest.runId}/${ref.key}`,
    }));
    const result = await new LocalNavSnapshotV3Runner(store).runNav(
      {
        runId: manifest.runId,
        snapshotRef: { snapshotId: manifest.contentHash, contentHash: manifest.contentHash },
        artifactRefs: refs,
      },
      signal(),
    );
    expect(result.evaluatedAt).toBe('2026-09-12T20:00:00+08:00');
    expect(result.equityCurve.at(-1)!.occurredAt).toBe(result.evaluatedAt);
  });
  it('真实 Parquet 到公开 NAV 结果，逐日权益、来源/费用与待处理保留，校验和及重放一致', async () => {
    const runner = new LocalNavSnapshotV3Runner(store);
    const result = await runner.runNav(input, signal());
    expect(backtestExecutionResultV3Schema.parse(result)).toEqual(result);
    expect(result).not.toHaveProperty('executionPriceProtocol');
    expect(result.navSource.routeKey.capability).toBe('FUND_NAV_HISTORY');
    expect(result.simulationFills.length).toBeGreaterThan(0);
    expect(result.equityCurve).toHaveLength(7);
    expect(result.equityCurve.at(-1)!.occurredAt).toBe('2026-09-15T20:00:00+08:00');
    expect(result.pendingRequestIds.length).toBeGreaterThan(0);
    expect(result.completeness).not.toBe('complete');
    const { resultChecksum, ...payload } = result;
    expect(resultChecksum).toBe(deterministicResultChecksum(payload));
    expect(await runner.runNav(input, signal())).toEqual(result);
    expect(verifyNavResultV3(result, await store.replay(input.runId))).toEqual(result);
  });
  it.each([1, 2])('公开研究 T+%s 结果保留假设与非严格 PIT 披露', async (delay) => {
    const fixture = navResearchFixture(delay);
    const manifest = await store.freeze(fixture);
    const request: BacktestNavV3RunnerInput = {
      runId: manifest.runId,
      snapshotRef: { snapshotId: manifest.contentHash, contentHash: manifest.contentHash },
      artifactRefs: [manifest.artifact, manifest.contextArtifact].map((ref) => ({
        ...ref,
        artifactId: ref.contentHash,
        key: `${manifest.runId}/${ref.key}`,
      })),
    };
    const result = await new LocalNavSnapshotV3Runner(store).runNav(request, signal());
    expect(result.visibilityDisclosure).toMatchObject({
      classification: 'research-assumption',
      strictPit: false,
    });
    expect(result.navVisibility).toEqual(manifest.navVisibility);
    expect(result.benchmark.totalReturn?.status).toBe('available');
  });
  it('冻结原文末尾零与内核规范化净值精确等值，真实数值篡改仍拒绝', async () => {
    const fixture = navResearchFixture(1);
    fixture.facts.forEach((fact) => {
      if (fact.nav !== null) fact.nav += '00';
    });
    const records = fixture.context.publicationRecords.map((record, index) => {
      const rawRecord = JSON.stringify({
        ...JSON.parse(record.rawRecord),
        nav: fixture.facts[index]!.nav,
      });
      fixture.facts[index]!.publicationEvidence.rawRecordHash = hashNavRaw(rawRecord);
      return { ...record, rawRecord };
    });
    fixture.context.publicationRecords = records;
    fixture.context.responseRaw = JSON.stringify({
      records: records.map((record) => JSON.parse(record.rawRecord)),
    });
    fixture.source.responseHash = hashNavRaw(fixture.context.responseRaw);
    const manifest = await store.freeze(fixture);
    const request: BacktestNavV3RunnerInput = {
      runId: manifest.runId,
      snapshotRef: { snapshotId: manifest.contentHash, contentHash: manifest.contentHash },
      artifactRefs: [manifest.artifact, manifest.contextArtifact].map((ref) => ({
        ...ref,
        artifactId: ref.contentHash,
        key: `${manifest.runId}/${ref.key}`,
      })),
    };
    const result = await new LocalNavSnapshotV3Runner(store).runNav(request, signal());
    const frozen = await store.replay(manifest.runId);
    expect(result.requests.some((item) => item.nav)).toBe(true);
    expect(verifyNavResultV3(result, frozen)).toEqual(result);
    const changed = structuredClone(result);
    const priced = changed.requests.find((item) => item.nav)!;
    priced.nav = '9';
    changed.simulationFills.find((fill) => fill.orderId === priced.requestId)!.price = '9';
    const { resultChecksum, ...payload } = changed;
    void resultChecksum;
    expect(() =>
      verifyNavResultV3(
        { ...payload, resultChecksum: deterministicResultChecksum(payload) },
        frozen,
      ),
    ).toThrow('定价');
  });
  it.each(['snapshot', 'missing', 'duplicate', 'extra', 'artifactId', 'path'])(
    '错误冻结引用拒绝：%s',
    async (kind) => {
      const value = structuredClone(input);
      if (kind === 'snapshot') value.snapshotRef.contentHash = 'f'.repeat(64);
      if (kind === 'missing') value.artifactRefs = value.artifactRefs.slice(0, 1);
      if (kind === 'duplicate')
        value.artifactRefs = [value.artifactRefs[0]!, value.artifactRefs[0]!];
      if (kind === 'extra')
        value.artifactRefs = [...value.artifactRefs, { ...value.artifactRefs[0]!, key: 'extra' }];
      if (kind === 'artifactId')
        value.artifactRefs = value.artifactRefs.map((ref) => ({ ...ref, artifactId: 'wrong' }));
      if (kind === 'path')
        value.artifactRefs = value.artifactRefs.map((ref) => ({ ...ref, key: `other/${ref.key}` }));
      await expect(new LocalNavSnapshotV3Runner(store).runNav(value, signal())).rejects.toThrow();
    },
  );
  it('预取消及读取后的取消失败关闭', async () => {
    await expect(
      new LocalNavSnapshotV3Runner(store).runNav(input, AbortSignal.abort()),
    ).rejects.toThrow('已取消');
    const controller = new AbortController();
    const replay = store.replay.bind(store);
    store.replay = async (id) => {
      const frozen = await replay(id);
      controller.abort();
      return frozen;
    };
    await expect(
      new LocalNavSnapshotV3Runner(store).runNav(input, controller.signal),
    ).rejects.toThrow('已取消');
  });
  it('物理产物篡改不发布结果', async () => {
    const path = resolve(root, 'artifacts', input.artifactRefs[0]!.key);
    const bytes = await readFile(path);
    bytes[0] = bytes[0]! ^ 1;
    await writeFile(path, bytes);
    await expect(new LocalNavSnapshotV3Runner(store).runNav(input, signal())).rejects.toThrow();
  });
  it('结果篡改及重新计算校验和后的错误冻结来源均拒绝', async () => {
    const result = await new LocalNavSnapshotV3Runner(store).runNav(input, signal());
    const frozen = await store.replay(input.runId);
    expect(() =>
      verifyNavResultV3({ ...result, cash: { ...result.cash, settled: '99999' } }, frozen),
    ).toThrow('校验和');
    const { resultChecksum, ...payload } = result;
    void resultChecksum;
    payload.navSource = { ...payload.navSource, sourceRevision: 'wrong' };
    expect(() =>
      verifyNavResultV3(
        { ...payload, resultChecksum: deterministicResultChecksum(payload) },
        frozen,
      ),
    ).toThrow('来源');
  });
  it('重新计算校验和仍不能改写冻结定价或注入预热申请', async () => {
    const result = await new LocalNavSnapshotV3Runner(store).runNav(input, signal());
    const frozen = await store.replay(input.runId);
    const changed = structuredClone(result);
    const priced = changed.requests.find((request) => request.nav)!;
    priced.nav = '9';
    changed.simulationFills.find((fill) => fill.orderId === priced.requestId)!.price = '9';
    const { resultChecksum, ...payload } = changed;
    void resultChecksum;
    expect(() =>
      verifyNavResultV3(
        { ...payload, resultChecksum: deterministicResultChecksum(payload) },
        frozen,
      ),
    ).toThrow('定价');
    payload.requests[0]!.nav = result.requests[0]!.nav!;
    payload.simulationFills[0]!.price = result.simulationFills[0]!.price;
    payload.requests[0]!.requestAt = '2026-09-07T05:00:00Z';
    expect(() =>
      verifyNavResultV3(
        { ...payload, resultChecksum: deterministicResultChecksum(payload) },
        frozen,
      ),
    ).toThrow('预热');
  });
});

import { mkdtemp, readFile, rm, writeFile, access, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LocalNavSnapshotStore,
  type NavSnapshotFreezeInput,
} from '../../src/backtest/backtest-nav-snapshot-store.js';
import { hashNavRaw, navFactRow } from '../../src/backtest/backtest-nav-freeze-validation.js';
import { hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { navFreezeFixture } from './nav-freeze.fixtures.js';

let root: string;
let store: LocalNavSnapshotStore;
beforeEach(async () => {
  root = await mkdtemp(resolve(tmpdir(), 'nav-freeze-'));
  store = new LocalNavSnapshotStore(root);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});
const manifestPath = () => resolve(root, 'snapshots/nav-run/finalized.json');

describe('NAV 实际冻结产物', () => {
  it('真实 Parquet 冻结后离线重建计划，保留来源原文并幂等读回', async () => {
    const input = navFreezeFixture();
    const before = structuredClone(input);
    const frozen = await store.freeze(input);
    const reread = await new LocalNavSnapshotStore(root).replay(input.runId);
    expect(reread.manifest).toEqual(frozen);
    expect(reread.context).toEqual(input.context);
    expect(reread.plan.navRange).toEqual({ startDate: '2026-09-07', endDate: '2026-09-15' });
    expect(reread.plan.calendarRange.endDate).toBe('2026-09-21');
    expect(await store.freeze(input)).toEqual(frozen);
    expect(input).toEqual(before);
  });

  it('已冻结不同输入不能覆盖，原 manifest 与结果保持不变', async () => {
    const input = navFreezeFixture();
    await store.freeze(input);
    const original = await readFile(manifestPath(), 'utf8');
    input.context.strategy.name = '另一策略';
    await expect(store.freeze(input)).rejects.toThrow('不同输入');
    expect(await readFile(manifestPath(), 'utf8')).toBe(original);
    await expect(store.replay(input.runId)).resolves.toBeDefined();
  });

  it.each([
    [
      '缺净值日',
      (i: NavSnapshotFreezeInput) => {
        i.facts.pop();
      },
    ],
    [
      '非法净值',
      (i: NavSnapshotFreezeInput) => {
        i.facts[0]!.nav = '-1';
      },
    ],
    [
      '原记录缺失',
      (i: NavSnapshotFreezeInput) => {
        i.context.publicationRecords.pop();
      },
    ],
    [
      '原记录重复',
      (i: NavSnapshotFreezeInput) => {
        i.context.publicationRecords[1] = i.context.publicationRecords[0]!;
      },
    ],
    [
      '净值与原文不符',
      (i: NavSnapshotFreezeInput) => {
        i.facts[0]!.nav = '1.26';
      },
    ],
    [
      '发布时间与原文不符',
      (i: NavSnapshotFreezeInput) => {
        const proof = i.facts[0]!.publicationEvidence;
        if (proof.kind === 'source-publication-record')
          proof.sourcePublishedAt = '2026-09-07T11:00:00Z';
      },
    ],
    [
      '来源响应摘要不符',
      (i: NavSnapshotFreezeInput) => {
        i.context.responseRaw += ' ';
      },
    ],
    [
      '日历原文篡改',
      (i: NavSnapshotFreezeInput) => {
        i.context.calendarRaw += ' ';
      },
    ],
    [
      '日历日期被缩短',
      (i: NavSnapshotFreezeInput) => {
        i.context.calendar.valuationDates.pop();
      },
    ],
    [
      '微秒未来可见',
      (i: NavSnapshotFreezeInput) => {
        i.facts.at(-1)!.availableAt = '2026-09-30T00:00:00.000002Z';
      },
    ],
    [
      '原记录摘要不符',
      (i: NavSnapshotFreezeInput) => {
        i.context.publicationRecords[0]!.rawRecord += ' ';
      },
    ],
  ] as const)('冻结前拒绝%s，不发布 manifest', async (_name, change) => {
    const i = navFreezeFixture();
    change(i);
    await expect(store.freeze(i)).rejects.toThrow();
    await expect(access(manifestPath())).rejects.toThrow();
  });

  it('第二份产物写入失败时清理本次产物，恢复后可完整冻结', async () => {
    const put = store.artifacts.put.bind(store.artifacts);
    vi.spyOn(store.artifacts, 'put')
      .mockImplementationOnce(put)
      .mockRejectedValueOnce(new Error('故障注入'));
    await expect(store.freeze(navFreezeFixture())).rejects.toThrow('故障注入');
    await expect(access(manifestPath())).rejects.toThrow();
    await expect(
      access(resolve(root, 'artifacts/nav-run/execution/nav.parquet')),
    ).rejects.toThrow();
    vi.restoreAllMocks();
    await expect(store.freeze(navFreezeFixture())).resolves.toBeDefined();
  });

  it.each(['execution/nav.parquet', 'metadata/nav-context-v3.parquet'])(
    '拒绝损坏的 %s',
    async (key) => {
      await store.freeze(navFreezeFixture());
      const path = resolve(root, 'artifacts/nav-run', key);
      const bytes = await readFile(path);
      bytes[20] = bytes[20]! ^ 1;
      await writeFile(path, bytes);
      await expect(store.replay('nav-run')).rejects.toThrow('content hash mismatch');
    },
  );

  it('冻结产物缺失时读取和幂等写入均拒绝，不重建已发布结果', async () => {
    await store.freeze(navFreezeFixture());
    const original = await readFile(manifestPath(), 'utf8');
    await rm(resolve(root, 'artifacts/nav-run/execution/nav.parquet'));
    await expect(store.replay('nav-run')).rejects.toThrow();
    await expect(store.freeze(navFreezeFixture())).rejects.toThrow();
    expect(await readFile(manifestPath(), 'utf8')).toBe(original);
  });

  it('拒绝旧格式、被重新计算摘要的错配 runId 和费用模型摘要', async () => {
    await store.freeze(navFreezeFixture());
    const original = JSON.parse(await readFile(manifestPath(), 'utf8'));
    for (const change of [
      (m: typeof original) => {
        m.manifestVersion = 'snapshot-manifest-v2';
      },
      (m: typeof original) => {
        m.runId = 'another-run';
      },
      (m: typeof original) => {
        m.executionModel.contentHash = 'a'.repeat(64);
      },
    ]) {
      const value = structuredClone(original);
      change(value);
      value.contentHash = hashCanonicalManifest(value);
      await writeFile(manifestPath(), JSON.stringify(value));
      await expect(store.replay('nav-run')).rejects.toThrow();
    }
  });

  it('原文被改写并重新标摘要仍必须与净值事实一致', async () => {
    const i = navFreezeFixture();
    const record = i.context.publicationRecords[0]!;
    const value = JSON.parse(record.rawRecord);
    value.sourcePublishedAt = '2026-09-07T11:00:00Z';
    record.rawRecord = JSON.stringify(value);
    i.facts[0]!.publicationEvidence.rawRecordHash = hashNavRaw(record.rawRecord);
    await expect(store.freeze(i)).rejects.toThrow();
  });

  it('不同采集响应不能借逐条记录补成同一来源证据', async () => {
    const i = navFreezeFixture();
    i.context.responseRaw = JSON.stringify({ records: [] });
    i.source.responseHash = hashNavRaw(i.context.responseRaw);
    await expect(store.freeze(i)).rejects.toThrow('不属于冻结来源响应');
  });

  it('同时冻结同一 Run 只发布一份完整结果', async () => {
    const results = await Promise.allSettled([
      store.freeze(navFreezeFixture()),
      store.freeze(navFreezeFixture()),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await expect(store.replay('nav-run')).resolves.toBeDefined();
  });

  it('Parquet 被替换并更新字节摘要后仍须与 Manifest 净值一致', async () => {
    const input = navFreezeFixture();
    const manifest = await store.freeze(input);
    const key = 'nav-run/execution/nav.parquet';
    await rm(resolve(root, 'artifacts', key));
    input.facts[0]!.nav = '1.26';
    const replacement = await store.artifacts.put({ key, rows: input.facts.map(navFactRow) });
    manifest.artifact.contentHash = replacement.contentHash;
    manifest.artifact.sizeBytes = replacement.sizeBytes;
    manifest.contentHash = hashCanonicalManifest(manifest);
    await writeFile(manifestPath(), JSON.stringify(manifest));
    await expect(store.replay('nav-run')).rejects.toThrow('净值 Parquet');
  });

  it('已有其他构建和非法 Run 路径拒绝，不清理原目录', async () => {
    const directory = resolve(root, 'snapshots/nav-run');
    await mkdir(directory, { recursive: true });
    const building = resolve(directory, 'building.json');
    await writeFile(building, '{"inputKind":"bar"}');
    await expect(store.freeze(navFreezeFixture())).rejects.toThrow('已有其他构建');
    expect(await readFile(building, 'utf8')).toBe('{"inputKind":"bar"}');
    await expect(store.freeze(navFreezeFixture('../escape'))).rejects.toThrow('runId');
  });

  it('异步冻结使用调用时的 Run 和输入副本', async () => {
    const input = navFreezeFixture();
    const pending = store.freeze(input);
    input.runId = 'changed-run';
    input.facts[0]!.nav = '9.99';
    const manifest = await pending;
    expect(manifest.runId).toBe('nav-run');
    expect(manifest.facts[0]!.nav).toBe('1.25');
    await expect(store.replay('nav-run')).resolves.toBeDefined();
    await expect(store.replay('changed-run')).rejects.toThrow();
  });
});

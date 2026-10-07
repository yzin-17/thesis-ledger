import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LocalNavSnapshotStore,
  type NavSnapshotFreezeInput,
} from '../../src/backtest/backtest-nav-snapshot-store.js';
import { adaptNavDomainInputsV3 } from '../../src/backtest/backtest-nav-domain-input.js';
import { hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { hashNavRaw } from '../../src/backtest/backtest-nav-source-evidence.js';
import { navResearchFixture } from './nav-research.fixtures.js';
import { navFreezeFixture } from './nav-freeze.fixtures.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(resolve(tmpdir(), 'nav-visibility-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('净值披露可见性冻结', () => {
  it('披露尾部独立于确认结算预算，完整日历范围取两者并集', async () => {
    const input = navResearchFixture(6, ['2026-09-22', '2026-09-23']);
    const store = new LocalNavSnapshotStore(root);
    await store.freeze(input);
    const replay = await store.replay(input.runId);
    expect(replay.plan.calendarRange.endDate).toBe('2026-09-21');
    expect(replay.plan.visibility.disclosureRange?.endDate).toBe('2026-09-23');
    expect(replay.plan.requiredCalendarRange.endDate).toBe('2026-09-23');
    expect(replay.manifest.facts.at(-1)!.availableAt).toBe('2026-09-24T00:00:00+08:00');
  });
  it.each([1, 2])('按 %i 个披露工作日冻结真实 Parquet 并离线重放', async (delay) => {
    const input = navResearchFixture(delay);
    const before = structuredClone(input);
    const store = new LocalNavSnapshotStore(root);
    const frozen = await store.freeze(input);
    const replay = await new LocalNavSnapshotStore(root).replay(input.runId);
    expect(replay.manifest).toEqual(frozen);
    expect(replay.context).toEqual(before.context);
    expect(input).toEqual(before);
    expect(JSON.stringify(replay.context.publicationRecords)).not.toContain('sourcePublishedAt');
    const friday = replay.manifest.facts.find((f) => f.valuationDate === '2026-09-11')!;
    // 周末和控制节假日 9 月 14 日均不计入，申赎处理日仍包含 14 日。
    expect(friday.availableAt).toBe(
      delay === 1 ? '2026-09-16T00:00:00+08:00' : '2026-09-17T00:00:00+08:00',
    );
    expect(replay.plan.processingDates).toContain('2026-09-14');
    expect(replay.plan.visibility.disclosureTailWorkdays).toBe(delay);
    expect(replay.plan.periodEnd.tailTradingDays).toBe(4);
    const adapted = adaptNavDomainInputsV3(replay);
    expect(adapted.visibilityDisclosure).toMatchObject({
      classification: 'research-assumption',
      strictPit: false,
    });
    expect(adapted.navVisibility).toEqual(input.context.runConfig.navVisibility);
    expect(
      adapted.pricingFactAt(
        '2026-09-11',
        delay === 1 ? '2026-09-15T15:59:59.999999Z' : '2026-09-16T15:59:59.999999Z',
      ),
    ).toBeUndefined();
    expect(adapted.pricingFactAt('2026-09-11', friday.availableAt)?.nav).toBe('1.25');
  });

  it('严格模式仍要求来源真实发布时间并携带严格标记', async () => {
    const store = new LocalNavSnapshotStore(root);
    const input = navFreezeFixture();
    await store.freeze(input);
    expect(
      adaptNavDomainInputsV3(await store.replay(input.runId)).visibilityDisclosure,
    ).toMatchObject({ classification: 'strict-publication', requiresSourcePitAdmission: true });
    input.runId = 'missing-publication';
    const raw = JSON.parse(input.context.publicationRecords[0]!.rawRecord);
    delete raw.sourcePublishedAt;
    input.context.publicationRecords[0]!.rawRecord = JSON.stringify(raw);
    input.facts[0]!.publicationEvidence.rawRecordHash = hashNavRaw(
      input.context.publicationRecords[0]!.rawRecord,
    );
    const response = JSON.parse(input.context.responseRaw);
    response.records[0] = raw;
    input.context.responseRaw = JSON.stringify(response);
    input.source.responseHash = hashNavRaw(input.context.responseRaw);
    await expect(store.freeze(input)).rejects.toThrow();
  });

  it.each([
    [
      '规则原文缺失',
      (i: NavSnapshotFreezeInput) => {
        i.context.ruleRaw = null;
      },
    ],
    [
      '规则原文篡改',
      (i: NavSnapshotFreezeInput) => {
        i.context.ruleRaw += ' ';
      },
    ],
    [
      '披露日期缺失',
      (i: NavSnapshotFreezeInput) => {
        i.context.calendar.disclosureWorkDates = [];
      },
    ],
    [
      '披露尾部不足',
      (i: NavSnapshotFreezeInput) => {
        i.context.calendar.disclosureWorkDates = i.context.calendar.disclosureWorkDates.filter(
          (d) => d <= '2026-09-15',
        );
      },
    ],
    [
      '净值原文篡改',
      (i: NavSnapshotFreezeInput) => {
        i.context.publicationRecords[0]!.rawRecord += ' ';
      },
    ],
    [
      '模式不符',
      (i: NavSnapshotFreezeInput) => {
        i.context.runConfig.navVisibility = { mode: 'strict-publication' };
        i.context.ruleRaw = null;
      },
    ],
    [
      '未来采集',
      (i: NavSnapshotFreezeInput) => {
        i.source.capturedAt = '2026-09-30T00:00:00.000002Z';
      },
    ],
    [
      '未来可见',
      (i: NavSnapshotFreezeInput) => {
        i.context.runConfig.dataAsOf = '2026-09-17T15:59:59.999999Z';
        i.source.capturedAt = '2026-09-17T00:00:00Z';
      },
    ],
    [
      '规则区间不足',
      (i: NavSnapshotFreezeInput) => {
        if (i.context.runConfig.navVisibility.mode === 'research-assumption')
          i.context.runConfig.navVisibility.rule.applicableRange.startDate = '2026-09-08';
      },
    ],
    [
      '未核查 QDII',
      (i: NavSnapshotFreezeInput) => {
        if (i.context.runConfig.navVisibility.mode === 'research-assumption')
          i.context.runConfig.navVisibility.rule.basis = 'domestic-default';
      },
    ],
    [
      '披露日期被重写',
      (i: NavSnapshotFreezeInput) => {
        if (i.facts[0]!.publicationEvidence.kind === 'research-assumption')
          i.facts[0]!.publicationEvidence.disclosureDate = '2026-09-10';
      },
    ],
    [
      '可见时间被重写',
      (i: NavSnapshotFreezeInput) => {
        const f = i.facts[0]!;
        f.availableAt = '2026-09-11T00:00:00+08:00';
        if (f.publicationEvidence.kind === 'research-assumption')
          f.publicationEvidence.assumedAvailableAt = f.availableAt;
      },
    ],
    [
      '日历摘要不符',
      (i: NavSnapshotFreezeInput) => {
        if (i.context.runConfig.navVisibility.mode === 'research-assumption')
          i.context.runConfig.navVisibility.disclosureCalendarHash = 'a'.repeat(64);
      },
    ],
  ] as const)('冻结前拒绝%s', async (_label, mutate) => {
    const input = navResearchFixture(2);
    mutate(input);
    await expect(new LocalNavSnapshotStore(root).freeze(input)).rejects.toThrow();
  });

  it('重新计算 Manifest 摘要也不能绕过规则重算与上下文核对', async () => {
    const input = navResearchFixture(2);
    const store = new LocalNavSnapshotStore(root);
    await store.freeze(input);
    const path = resolve(root, 'snapshots/research-run/finalized.json');
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    manifest.navVisibility.rule.delayWorkdays = 3;
    manifest.contentHash = hashCanonicalManifest(manifest);
    await writeFile(path, JSON.stringify(manifest));
    await expect(store.replay(input.runId)).rejects.toThrow();
  });
});

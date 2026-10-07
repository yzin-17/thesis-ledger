import 'reflect-metadata';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotStore, hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';
import { marketFrozenWindowHashV3 } from '../../src/market/market-frozen-window-v3.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';

const origin = process.env.CALENDAR_RELEASE_DSA_ORIGIN;
const token = process.env.CALENDAR_RELEASE_DSA_TOKEN;

(origin && token ? it : it.skip)('真实 DSA 日历发布边界经 Client 完整冻结后离线重放', async () => {
  const url = new URL(origin!);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('仅允许本地验收服务');
  const root = await mkdtemp(join(tmpdir(), 'calendar-release-http-'));
  try {
    vi.stubEnv('DATABASE_URL', 'postgresql://unused:unused@127.0.0.1/unused');
    vi.stubEnv('REDIS_URL', 'redis://127.0.0.1:16379');
    vi.stubEnv('DSA_BASE_URL', origin!);
    vi.stubEnv('THESIS_LEDGER_DSA_TOKEN', token!);
    vi.stubEnv('CREDENTIAL_ENCRYPTION_KEY', 'isolated-calendar-http-fixture');
    const client = new DsaClient();
    const rejected = await client.backtestCalendar({
      market: 'CN',
      start: '2020-01-30',
      end: '2020-02-03',
      dataAsOf: '2026-03-10T03:24:37.055241Z',
    });
    expect(rejected.status).toBe('unavailable');
    expect(rejected.facts).toEqual([]);
    const fixture = await completeSnapshotFixture();
    fixture.input.strategyVersionHash = hashCanonicalManifest(fixture.input.strategy);
    fixture.dsa.backtestCalendar.mockImplementation((request) => client.backtestCalendar(request));
    const original = fixture.reader.readV3.getMockImplementation()!;
    // 行情仍为合成输入；交易日期从实际日历读取，避免制造休市日 Bar。
    fixture.reader.readV3.mockImplementation(async (request) => {
      const result = await original(request);
      if (result.status !== 'selected') throw new Error('fixture unavailable');
      const calendar = await client.backtestCalendar({
        market: 'CN',
        start: request.window.start,
        end: request.window.end,
        dataAsOf: fixture.input.runConfig.dataAsOf,
      });
      expect(calendar.status).toBe('supported');
      const holidays = new Set(calendar.facts[0]!.holidays);
      const response = result.selection.response;
      response.bars = response.bars.filter((bar) => !holidays.has(bar.timestamp.slice(0, 10)));
      response.coverage.actualStart = response.bars[0]!.timestamp;
      response.coverage.actualEnd = response.bars.at(-1)!.timestamp;
      response.coverageProof.calendar.expectedSessionDates = response.bars.map((bar) =>
        bar.timestamp.slice(0, 10),
      );
      result.evidence.completeResponseHash = marketFrozenWindowHashV3(response);
      return result;
    });
    const store = new LocalSnapshotStore(root);
    const built = await new DsaSnapshotBuilder(
      fixture.dsa as unknown as DsaClient,
      store,
      fixture.reader,
    ).buildV3(fixture.input);
    const ref = built.artifactRefs.find((item) => item.key.includes('/calendar/'))!;
    const rows = [];
    for await (const row of await store.artifacts.openRead(ref)) rows.push(row);
    expect(rows[0]).toMatchObject({
      availableAt: '2026-03-10T03:24:37.055242+00:00',
      providerRevision: 'exchange-calendars-4.13.2-release-evidence-v1',
    });
    fixture.dsa.backtestCalendar.mockRejectedValue(new Error('offline'));
    fixture.reader.readV3.mockRejectedValue(new Error('offline'));
    const run = {
      runId: fixture.input.runId,
      snapshotRef: built.snapshotRef,
      artifactRefs: built.artifactRefs,
    };
    const replay = new LocalSnapshotStore(root);
    expect(await replay.v3.replay(run.runId)).toEqual(built.manifest);
    const first = await new LocalSnapshotV3Runner(replay).run(run, new AbortController().signal);
    expect(
      await new LocalSnapshotV3Runner(new LocalSnapshotStore(root)).run(
        run,
        new AbortController().signal,
      ),
    ).toEqual(first);
  } finally {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  }
});

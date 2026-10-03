import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  runConfigSchemaV3,
  marketEventResponseV3Schema,
  type MarketEventResponseV3,
} from '@thesis-ledger/schemas';
import {
  rebindTushareIdentityContent,
  tushareEventFixture,
  tushareIdentityBundle,
} from '../market/tushare-event-fixtures.js';
import { rqdataEventFixture } from '../market/rqdata-event-fixtures.js';
import { buildInput } from './v3-snapshot-fixtures.js';
import { planBacktestDependencies } from '../../src/backtest/backtest-dependency-plan.js';
import { expectedSnapshotDependencyRequestsV3 } from '../../src/backtest/backtest-snapshot-v3-dependencies.js';
import { validateSnapshotEventsV3 } from '../../src/backtest/backtest-snapshot-v3-events.js';
import { LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';

async function snapshotFixture(complete = true) {
  const { input: source } = await buildInput();
  const cash = tushareEventFixture();
  cash.request.dataAsOf = '2026-09-28T12:00:00.000001Z';
  cash.response.dataAsOf = cash.request.dataAsOf;
  const protocol = JSON.parse(
    await readFile(
      new URL(
        '../../../../packages/schemas/fixtures/execution-price.raw-events.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const runConfig = runConfigSchemaV3.parse({
    ...source.runConfig,
    startDate: cash.request.start,
    endDate: cash.request.end,
    dataAsOf: cash.request.dataAsOf,
    executionPriceProtocol: protocol,
    executionModel: undefined,
  });
  const input = {
    strategy: source.strategy,
    runConfig,
    plan: planBacktestDependencies({ strategy: source.strategy, runConfig }),
    eventRevisions: { desiredRevision: 1, effectivePolicyRevision: 1, catalogRevision: 1 },
  };
  const request = expectedSnapshotDependencyRequestsV3(input).find(
    (value) => value.purpose === 'corporateActions',
  );
  if (!request || request.purpose !== 'corporateActions') throw new Error('缺少事件依赖请求');
  const split = rqdataEventFixture('SPLIT_EVENT');
  split.request.dataAsOf = cash.request.dataAsOf;
  split.response.dataAsOf = cash.request.dataAsOf;
  const exchanges = [cash, split].map((fixture) => {
    const response = marketEventResponseV3Schema.parse(fixture.response);
    // 合成完整覆盖仅验证既有冻结路径，不代表真实 fund_div 历史覆盖。
    if (complete)
      response.coverage = { complete: true, admissionEvidenceRef: response.admission!.evidenceRef };
    return { request: fixture.request, response };
  });
  return { input, request, bundle: { kind: 'snapshot-events-v3', exchanges } };
}

const mutations: [string, (response: MarketEventResponseV3) => void][] = [
  [
    '原文空白篡改',
    (response) => {
      response.tushareIdentityEvidence!.content += ' ';
    },
  ],
  [
    '摘要篡改',
    (response) => {
      response.tushareIdentityEvidence!.sha256 = 'f'.repeat(64);
    },
  ],
  [
    '证据缺失',
    (response) => {
      delete response.tushareIdentityEvidence;
    },
  ],
  [
    '准入绑定摘要错配',
    (response) => {
      response.admission!.evidenceSha256 = 'f'.repeat(64);
    },
  ],
  [
    '身份范围超出准入',
    (response) => {
      const bundle = tushareIdentityBundle(response);
      bundle.mappings[0]!.scopeDateTo = '2026-01-01';
      rebindTushareIdentityContent(response, JSON.stringify(bundle));
    },
  ],
  [
    '独立币种错配',
    (response) => {
      const bundle = tushareIdentityBundle(response);
      bundle.mappings[0]!.dividendCurrencyEvidence.currency = 'HKD';
      rebindTushareIdentityContent(response, JSON.stringify(bundle));
    },
  ],
  [
    '微秒到期',
    (response) => {
      response.fetchedAt = '2026-09-28T12:00:00.000001Z';
      response.admission!.validUntil = response.fetchedAt;
    },
  ],
];

describe('Tushare 身份原文离线重放', () => {
  it('实际 Parquet 及新 Store 读回，按原时刻重验并拒绝损坏证据', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tushare-identity-replay-'));
    try {
      const { input, request, bundle } = await snapshotFixture();
      const original = validateSnapshotEventsV3(input, request, bundle);
      const artifact = await new LocalSnapshotStore(root).v3.putArtifact('synthetic-identity-replay', {
        key: 'metadata/events.parquet',
        rows: [original.evidence],
      });
      const rows = [];
      for await (const row of await new LocalSnapshotStore(root).artifacts.openRead(artifact))
        rows.push(row);
      const frozen = JSON.parse(String(rows[0]!.response));
      expect(frozen).toEqual(bundle);
      const now = vi.spyOn(Date, 'now').mockImplementation(() => {
        throw new Error('离线不得读取当前时钟');
      });
      try {
        expect(validateSnapshotEventsV3(input, request, frozen)).toEqual(original);
      } finally {
        now.mockRestore();
      }
      for (const [name, mutate] of mutations) {
        const changed = structuredClone(frozen);
        mutate(changed.exchanges[0].response);
        expect(() => validateSnapshotEventsV3(input, request, changed), name).toThrow();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('完整身份原文不授予未知历史覆盖冻结资格', async () => {
    const { input, request, bundle } = await snapshotFixture(false);
    expect(() => validateSnapshotEventsV3(input, request, bundle)).toThrow('覆盖不满足');
  });

  it('微秒到期前的冻结观测仍有效', async () => {
    const { input, request, bundle } = await snapshotFixture();
    bundle.exchanges[0]!.response.admission!.validUntil = '2026-09-28T12:00:00.000001Z';
    expect(() => validateSnapshotEventsV3(input, request, bundle)).not.toThrow();
  });
});

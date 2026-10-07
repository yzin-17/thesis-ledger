import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { marketEventResponseV3Schema, runConfigSchemaV3 } from '@thesis-ledger/schemas';
import {
  hithinkEventFixture,
  rebindHithinkIdentityContent,
} from '../market/hithink-event-fixtures.js';
import { rqdataEventFixture } from '../market/rqdata-event-fixtures.js';
import { buildInput } from './v3-snapshot-fixtures.js';
import { planBacktestDependencies } from '../../src/backtest/backtest-dependency-plan.js';
import { expectedSnapshotDependencyRequestsV3 } from '../../src/backtest/backtest-snapshot-v3-dependencies.js';
import { validateSnapshotEventsV3 } from '../../src/backtest/backtest-snapshot-v3-events.js';
import { LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';

async function snapshotFixture(complete = true) {
  const { input: source } = await buildInput();
  const cash = hithinkEventFixture();
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
  const exchanges = [cash, split].map((value) => {
    const response = marketEventResponseV3Schema.parse(value.response);
    // 仅验证合成冻结重验；真实分红端点始终报告历史覆盖不完整。
    if (complete)
      response.coverage = { complete: true, admissionEvidenceRef: response.admission!.evidenceRef };
    return { request: value.request, response };
  });
  return { input, request, bundle: { kind: 'snapshot-events-v3', exchanges } };
}

describe('HiThink 分红身份原文离线冻结', () => {
  it('Parquet 读回仍按原字节、币种和准入核验', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hithink-identity-replay-'));
    try {
      const { input, request, bundle } = await snapshotFixture();
      const original = validateSnapshotEventsV3(input, request, bundle);
      const artifact = await new LocalSnapshotStore(root).v3.putArtifact('synthetic-hithink-replay', {
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
      const altered = structuredClone(frozen);
      altered.exchanges[0].response.hithinkIdentityEvidence.content += ' ';
      expect(() => validateSnapshotEventsV3(input, request, altered)).toThrow('身份映射证据无效');
      const rebound = structuredClone(frozen);
      const response = rebound.exchanges[0].response;
      const identity = JSON.parse(response.hithinkIdentityEvidence.content);
      identity.mappings[0].dividendCurrencyEvidence.currency = 'HKD';
      rebindHithinkIdentityContent(response, JSON.stringify(identity));
      expect(() => validateSnapshotEventsV3(input, request, rebound)).toThrow('准入快照无效');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('身份原文完整仍不能把未知历史覆盖当作完整事件依赖', async () => {
    const { input, request, bundle } = await snapshotFixture(false);
    expect(() => validateSnapshotEventsV3(input, request, bundle)).toThrow('覆盖不满足');
  });
});

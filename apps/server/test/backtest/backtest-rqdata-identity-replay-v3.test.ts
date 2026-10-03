import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runConfigSchemaV3, marketEventResponseV3Schema } from '@thesis-ledger/schemas';
import { rqdataEventFixture } from '../market/rqdata-event-fixtures.js';
import { buildInput } from './v3-snapshot-fixtures.js';
import { planBacktestDependencies } from '../../src/backtest/backtest-dependency-plan.js';
import { expectedSnapshotDependencyRequestsV3 } from '../../src/backtest/backtest-snapshot-v3-dependencies.js';
import { validateSnapshotEventsV3 } from '../../src/backtest/backtest-snapshot-v3-events.js';
import { LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';

async function snapshotFixture(complete = true) {
  const { input: source } = await buildInput();
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
    startDate: '2025-02-01',
    endDate: '2025-03-01',
    dataAsOf: '2026-09-27T12:00:00Z',
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
  const exchanges = (['CASH_DISTRIBUTION', 'SPLIT_EVENT'] as const).map((capability) => {
    const fixture = rqdataEventFixture(capability);
    const response = marketEventResponseV3Schema.parse(fixture.response);
    if (complete)
      response.coverage = { complete: true, admissionEvidenceRef: response.admission!.evidenceRef };
    const requestId = `identity-replay-${capability}`;
    return { request: { ...fixture.request, requestId }, response: { ...response, requestId } };
  });
  return { input, request, bundle: { kind: 'snapshot-events-v3', exchanges } };
}

describe('RQData 身份原文离线冻结', () => {
  it('实际 Parquet 及新 Store 读取后重验原文，使用原观测时刻', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rqdata-identity-replay-'));
    try {
      const { input, request, bundle } = await snapshotFixture();
      const original = validateSnapshotEventsV3(input, request, bundle);
      const artifact = await new LocalSnapshotStore(root).v3.putArtifact('identity-replay', {
        key: 'metadata/events.parquet',
        rows: [original.evidence],
      });
      const rows = [];
      for await (const row of await new LocalSnapshotStore(root).artifacts.openRead(artifact))
        rows.push(row);
      const frozen = JSON.parse(String(rows[0]!.response));
      expect(frozen).toEqual(bundle);
      expect(validateSnapshotEventsV3(input, request, frozen)).toEqual(original);
      frozen.exchanges[0].response.identityEvidence.content += ' ';
      expect(() => validateSnapshotEventsV3(input, request, frozen)).toThrow('身份映射证据无效');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('有完整身份原文仍不能冻结未证明的历史覆盖', async () => {
    const { input, request, bundle } = await snapshotFixture(false);
    expect(() => validateSnapshotEventsV3(input, request, bundle)).toThrow('覆盖不满足');
  });

  it('准入有效期按原 fetchedAt 重验，拒绝边界外的冻结观测', async () => {
    const { input, request, bundle } = await snapshotFixture();
    bundle.exchanges[0]!.response.admission!.validUntil = bundle.exchanges[0]!.response.fetchedAt;
    expect(() => validateSnapshotEventsV3(input, request, bundle)).toThrow('准入快照无效');
  });
});

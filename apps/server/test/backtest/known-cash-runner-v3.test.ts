import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';
import { buildBacktestSnapshotV3 } from '../../src/backtest/backtest-snapshot-v3-builder.js';
import { KnownCashEntitlementV3 } from '../../src/backtest/backtest-known-cash-entitlement-v3.js';
import { cnTradingCalendar, type BacktestCorporateActionFact } from '@thesis-ledger/domain';
import { knownCashSnapshotFixture } from './known-cash-snapshot-fixtures.js';
import { knownCashControlFixture } from './known-cash-test-fixtures.js';
import { freezeKnownCashResearchInputV3 } from '../../src/backtest/backtest-known-cash-research-v3.js';
import { hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { createHash } from 'node:crypto';
import type { MarketKnownCashControlResponseV3 } from '@thesis-ledger/schemas';

describe('冻结现金资料的真实本地Runner', () => {
  it.each(['exclude', 'assume-scheduled'] as const)(
    '新冻结选择%s实际决定现金，未知记录仍展示',
    async (selection) => {
      const root = await mkdtemp(join(tmpdir(), 'cash-selection-runner-'));
      try {
        const f = await knownCashSnapshotFixture(true);
        const prepared = f.input.runConfig.knownCashPreparation!;
        const record = {
          ...prepared.input.records[0]!,
          sourceStatus: '2',
          normalizedStatus: 'unknown' as const,
          statusBasis: 'unverified' as const,
          planStatus: 'unknown' as const,
          issues: ['UNKNOWN_DIVIDEND_STATUS'],
        };
        const rawBusinessResponse = '{"code":0,"data":{"item":[]}}';
        const policy = { ...prepared.input.policy, entitlement: 'cn-etf-record-close-holdings-v2' as const, uncertainRecords: selection };
        const assessment = {
          version: 'cash-record-assessment-v1' as const,
          responseComplete: true as const,
          transportCountVerified: true,
          historicalCoverageVerified: false as const,
          rawItemCount: 1,
          counts: { usable: 1, excluded: 0, duplicate: 0, 'outside-window': 0, placeholder: 0 },
          observations: [
            {
              rowIndex: 0,
              sourceStatus: '2',
              normalizedStatus: 'unknown' as const,
              sourceAmount: record.sourceAmount.value,
              amountPerFundUnit: record.amountPerFundUnit,
              currency: 'CNY' as const,
              identityBasis: 'request-bound' as const,
              currencyBasis: 'explicit-research-scope' as const,
              announcementDate: record.announcementDate,
              recordDate: record.recordDate,
              effectiveDate: record.effectiveDate,
              paymentDate: record.paymentDate,
              issues: record.issues,
              disposition: 'usable' as const,
            },
          ],
          rawBusinessResponse,
        };
        const source = {
          ...prepared.input.source,
          responseSha256: createHash('sha256').update(rawBusinessResponse).digest('hex'),
        };
        prepared.input = freezeKnownCashResearchInputV3({
          ...prepared.input,
          source,
          records: [record],
          policy,
          assessment,
        });
        prepared.acquisition.exchange.request.researchPolicy = policy;
        Object.assign(prepared.acquisition.exchange.response, {
          researchPolicy: policy,
          source,
          records: [record],
          assessment,
        });
        prepared.contentHash = hashCanonicalManifest(prepared);
        f.control.mockImplementation(
          async () => knownCashControlFixture(prepared) as MarketKnownCashControlResponseV3,
        );
        const snapshots = new LocalSnapshotStore(root);
        const snapshot = await buildBacktestSnapshotV3(
          f.input,
          snapshots.v3,
          f.reader,
          f.dsa,
          undefined,
          undefined,
          f.control,
        );
        const runner = new LocalSnapshotV3Runner(snapshots);
        const input = {
          runId: f.input.runId,
          snapshotRef: snapshot.snapshotRef,
          artifactRefs: snapshot.artifactRefs,
        };
        const result = await runner.run(input, new AbortController().signal);
        const disclosed = result.knownCashDividendDisclosure!.records[0]!;
        expect(disclosed.normalizedStatus).toBe('unknown');
        expect(result.knownCashDividendDisclosure!.coverage.complete).toBe(false);
        if (selection === 'exclude')
          expect(disclosed).toMatchObject({ status: 'not-adopted', grossCashAmount: null });
        else {
          expect(disclosed.status).toBe('simulated-paid');
          expect(Number(disclosed.grossCashAmount)).toBeGreaterThan(0);
        }
        expect(await runner.run(input, new AbortController().signal)).toEqual(result);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
  it.each([false, true])(
    '冻结资料进入持仓/应收/模拟发放，当前来源不可用也能离线重放；缓冲版本=%s',
    async (buffered) => {
      const root = await mkdtemp(join(tmpdir(), 'known-runner-'));
      try {
        const f = await knownCashSnapshotFixture(buffered);
        const snapshots = new LocalSnapshotStore(root);
        const snapshot = await buildBacktestSnapshotV3(
          f.input,
          snapshots.v3,
          f.reader,
          f.dsa,
          undefined,
          undefined,
          f.control,
        );
        f.reader.readV3.mockRejectedValue(new Error('network forbidden'));
        f.control.mockRejectedValue(new Error('network forbidden'));
        const runner = new LocalSnapshotV3Runner(snapshots);
        const result = await runner.run(
          {
            runId: f.input.runId,
            snapshotRef: snapshot.snapshotRef,
            artifactRefs: snapshot.artifactRefs,
          },
          new AbortController().signal,
        );
        expect(result.knownCashDividendDisclosure?.coverage.complete).toBe(false);
        expect(result.knownCashDividendDisclosure?.records[0]).toMatchObject({
          status: 'simulated-paid',
        });
        expect(
          Number(result.knownCashDividendDisclosure!.records[0]!.eligibleQuantity),
          JSON.stringify(result),
        ).toBeGreaterThan(0);
        expect(result).not.toHaveProperty('cashDividendDisclosure');
        expect(
          await runner.run(
            {
              runId: f.input.runId,
              snapshotRef: snapshot.snapshotRef,
              artifactRefs: snapshot.artifactRefs,
            },
            new AbortController().signal,
          ),
        ).toEqual(result);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
  it('legacy资格按原已结算决策状态重放；窗口内缺状态拒绝，窗口前资格0', () => {
    const value = new KnownCashEntitlementV3(cnTradingCalendar, '2025-06-01');
    const fact = {
      type: 'CASH_DIVIDEND',
      recordDate: '2025-06-17',
    } as BacktestCorporateActionFact;
    expect(() => value.quantityFor(fact)).toThrow('未冻结');
    value.capture('2025-06-17T07:00:00Z', '0');
    value.capture('2025-06-18T07:00:00Z', '100');
    expect(value.quantityFor(fact)).toBe('0');
    expect(value.quantityFor({ ...fact, recordDate: '2025-05-30' })).toBe('0');
  });
});

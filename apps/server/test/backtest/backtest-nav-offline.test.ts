import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deterministicResultChecksum, type CnNavRequest } from '@thesis-ledger/domain';
import { LocalNavSnapshotStore } from '../../src/backtest/backtest-nav-snapshot-store.js';
import {
  replayNavOfflineEvents,
  runNavOfflineV3,
} from '../../src/backtest/backtest-nav-offline.js';
import { runNavOfflineStrategyV3 } from '../../src/backtest/backtest-nav-offline-strategy.js';
import { navFreezeFixture } from './nav-freeze.fixtures.js';
import { navResearchFixture } from './nav-research.fixtures.js';
import { hashNavRaw } from '../../src/backtest/backtest-nav-freeze-validation.js';

let root: string;
let store: LocalNavSnapshotStore;
let frozen: Awaited<ReturnType<LocalNavSnapshotStore['replay']>>;
beforeEach(async () => {
  root = await mkdtemp(resolve(tmpdir(), 'nav-offline-'));
  store = new LocalNavSnapshotStore(root);
  await store.freeze(navFreezeFixture());
  frozen = await store.replay('nav-run');
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
const request = (id: string, at: string, redeem = false): CnNavRequest => ({
  eventId: `${id}:request`,
  requestId: id,
  requestType: redeem ? 'redeem' : 'subscribe',
  executionSymbol: '110011.OF',
  requestAt: at,
  occurredAt: at,
  availableAt: at,
  ...(redeem ? { shares: '10' } : { amount: '100' }),
});

describe('NAV 冻结纯离线执行', () => {
  it.each([1, 2])('研究 T+%s 可见性独立延后确认，保留假设披露', async (delay) => {
    const fixture = navResearchFixture(delay);
    await store.freeze(fixture);
    const result = runNavOfflineV3(await store.replay('research-run'), [
      request('buy', '2026-09-08T05:00:00Z'),
    ]);
    expect(result.rejects).toEqual([]);
    expect(result.visibilityDisclosure).toMatchObject({
      classification: 'research-assumption',
      strictPit: false,
    });
    expect(result.state.requests[0]!.confirmationAt).toBe(
      delay === 1 ? '2026-09-10T00:00:00+08:00' : '2026-09-11T00:00:00+08:00',
    );
    expect(result.state.requests[0]!.confirmedShares).toBe('80');
  });
  it('基准与期末估值使用执行窗口可见净值，冻结原文同步绑定', async () => {
    const fixture = navFreezeFixture('benchmark-run');
    const last = fixture.facts.at(-1)!;
    last.nav = '2';
    const record = fixture.context.publicationRecords.at(-1)!;
    const raw = JSON.parse(record.rawRecord) as { nav: string };
    raw.nav = '2';
    record.rawRecord = JSON.stringify(raw);
    if (last.publicationEvidence.kind === 'source-publication-record')
      last.publicationEvidence.rawRecordHash = hashNavRaw(record.rawRecord);
    fixture.context.responseRaw = JSON.stringify({
      records: fixture.context.publicationRecords.map((item) => JSON.parse(item.rawRecord)),
    });
    fixture.source.responseHash = hashNavRaw(fixture.context.responseRaw);
    await store.freeze(fixture);
    const result = runNavOfflineV3(await store.replay('benchmark-run'), [
      request('buy', '2026-09-08T05:00:00Z'),
    ]);
    expect(result.valuation.equity).toBe('10059');
    expect(result.benchmark).toMatchObject({
      totalReturn: '0.6',
      startDate: '2026-09-08',
      endDate: '2026-09-15',
    });
  });
  it('同一毫秒内的未来净值不能进入策略指标或基准', async () => {
    const fixture = navFreezeFixture('signal-micro');
    fixture.facts[0]!.availableAt = '2026-09-08T12:00:00.000001Z';
    fixture.facts[1]!.availableAt = '2026-09-08T12:00:00.000001Z';
    await store.freeze(fixture);
    const micro = await store.replay('signal-micro');
    const before = runNavOfflineV3(micro, [], { through: '2026-09-08T12:00:00Z' });
    expect(before.benchmark.status).toBe('unavailable');
    // 首个日频评估时刻为当日 20:00，北京时间对应 12:00Z。
    expect(runNavOfflineStrategyV3(micro).requests[0]!.requestAt).toBe('2026-09-09T20:00:00+08:00');
  });
  it('冻结策略离线生成申请，预热不消耗入场且不会交易，待结算阻止重复申请', () => {
    const result = runNavOfflineStrategyV3(frozen);
    expect(result.requests.length).toBeGreaterThan(0);
    expect(result.requests[0]!.requestAt).toBe('2026-09-08T20:00:00+08:00');
    expect(result.requests[0]!.amount).toBe('1.25');
    expect(result.state.requests[0]!.valuationDate).toBe('2026-09-09');
    expect(result.rejects).toEqual([]);
    expect(result.sizingRejects).toEqual([]);
    expect(result.events.filter((item) => item.event.type === 'request')).toHaveLength(
      result.requests.length,
    );
    expect(runNavOfflineStrategyV3(frozen)).toEqual(result);
    expect(replayNavOfflineEvents(frozen, result.events)).toEqual(result.state);
  });
  it('独立编排确认、份额和现金；费用只来自冻结模型，重放一致', async () => {
    const requests = [
      request('buy', '2026-09-08T05:00:00Z'),
      request('sell', '2026-09-10T05:00:00Z', true),
    ];
    const result = runNavOfflineV3(frozen, requests);
    const { resultChecksum, ...payload } = result;
    expect(resultChecksum).toBe(deterministicResultChecksum(payload));
    expect(result.rejects).toEqual([]);
    expect(result.pendingRequests).toEqual([]);
    expect(result.state.ledger.position.quantity).toBe('70');
    expect(result.state.ledger.cash.CNY.settled).toBe('9911.37');
    expect(result.state.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requestId: 'buy',
          fee: '1',
          confirmedShares: '80',
          expectedCashSettlement: '101',
        }),
        expect.objectContaining({
          requestId: 'sell',
          fee: '0.13',
          expectedCashSettlement: '12.37',
        }),
      ]),
    );
    expect(result.state.requests[0]!.confirmationAt).toBe('2026-09-09T00:00:00+08:00');
    expect(result.valuation.equity).toBe('9998.87');
    expect(result.benchmark).toMatchObject({ status: 'available', totalReturn: '0' });
    expect(replayNavOfflineEvents(frozen, result.events)).toEqual(result.state);
    expect(runNavOfflineV3(await store.replay('nav-run'), requests)).toEqual(result);
  });
  it.each([
    ['2026-09-08T05:59:59.999999Z', '2026-09-08'],
    ['2026-09-08T06:00:00Z', '2026-09-09'],
    ['2026-09-08T06:00:00.000001Z', '2026-09-09'],
  ])('冻结 14:00 截止 %s 使用 %s 净值', (at, date) => {
    const result = runNavOfflineV3(frozen, [request('buy', at)]);
    expect(result.rejects).toEqual([]);
    expect(result.state.requests[0]!.valuationDate).toBe(date);
  });
  it('同一毫秒内尚不可见不定价，等于可见时刻才生成净值事件', async () => {
    const fixture = navFreezeFixture('micro-run');
    fixture.facts[1]!.availableAt = '2026-09-08T12:00:00.000001Z';
    await store.freeze(fixture);
    const micro = await store.replay('micro-run');
    const requests = [request('buy', '2026-09-08T05:00:00Z')];
    const before = runNavOfflineV3(micro, requests, { through: '2026-09-08T12:00:00Z' });
    expect(before.state.requests[0]!.status).toBe('pending');
    expect(before.events.some((item) => item.event.type === 'nav')).toBe(false);
    const equal = runNavOfflineV3(micro, requests, { through: '2026-09-08T12:00:00.000001Z' });
    expect(equal.state.requests[0]!.status).toBe('priced');
    expect(equal.events.at(-1)!.evaluationAt).toBe('2026-09-08T12:00:00.000001Z');
  });
  it('预热和非处理日禁止申请，期末待处理不被尾部现金提前收敛', () => {
    const result = runNavOfflineV3(frozen, [
      request('warmup', '2026-09-07T05:00:00Z'),
      request('closed', '2026-09-12T05:00:00Z'),
      request('last', '2026-09-15T05:00:00Z'),
    ]);
    expect(result.rejects.map((reject) => reject.code)).toEqual([
      'OUTSIDE_EXECUTION_WINDOW',
      'OUTSIDE_EXECUTION_WINDOW',
    ]);
    expect(result.pendingRequests).toMatchObject([{ requestId: 'last', status: 'priced' }]);
    expect(result.state.ledger.position.quantity).toBe('0');
    expect(result.state.ledger.cash.CNY.settled).toBe('10000');
  });
  it('费用后的现金不足与未可卖份额不能绕过内核', () => {
    const result = runNavOfflineV3(frozen, [
      { ...request('too-much', '2026-09-08T04:00:00Z'), amount: '10000' },
      request('buy', '2026-09-08T05:00:00Z'),
      request('too-early', '2026-09-09T05:00:00Z', true),
    ]);
    expect(result.rejects.map((reject) => reject.code)).toEqual([
      'INSUFFICIENT_CASH',
      'INSUFFICIENT_POSITION',
    ]);
  });
  it('取消信号、超出期末、篡改冻结和晚到重放拒绝', () => {
    expect(() =>
      runNavOfflineV3(frozen, [request('buy', '2026-09-08T05:00:00Z')], {
        signal: AbortSignal.abort(),
      }),
    ).toThrow('已取消');
    expect(() => runNavOfflineV3(frozen, [], { through: '2026-09-30T00:00:00Z' })).toThrow(
      '不能超过',
    );
    const result = runNavOfflineV3(frozen, [request('buy', '2026-09-08T05:00:00Z')]);
    const events = structuredClone(result.events);
    events.find((item) => item.event.type === 'nav')!.evaluationAt = '2026-09-08T11:59:59.999999Z';
    expect(() => replayNavOfflineEvents(frozen, events)).toThrow('尚不可见');
    frozen.manifest.contentHash = '0'.repeat(64);
    expect(() => runNavOfflineV3(frozen, [])).toThrow();
  });
  it('期末截止后申请保留 pending；重复事件和微秒请求时刻错配拒绝', () => {
    const at = '2026-09-15T06:00:00Z';
    const last = runNavOfflineV3(frozen, [request('last', at)]);
    expect(last.pendingRequests).toMatchObject([
      { requestId: 'last', status: 'pending', valuationDate: '2026-09-16' },
    ]);
    const same = request('buy', '2026-09-08T05:00:00Z');
    const duplicate = runNavOfflineV3(frozen, [same, same]);
    expect(duplicate.rejects[0]!.code).toBe('DUPLICATE_EVENT');
    const mismatch = runNavOfflineV3(frozen, [
      { ...same, requestAt: '2026-09-08T05:00:00.000001Z' },
    ]);
    expect(mismatch.rejects[0]!.code).toBe('INVALID_TIME');
  });
  it('重放不能注入预热申请或超出期末的结算', () => {
    const result = runNavOfflineV3(frozen, [request('buy', '2026-09-08T05:00:00Z')]);
    const warmup = structuredClone(result.events);
    warmup[0] = {
      phase: 0,
      evaluationAt: '2026-09-07T05:00:00Z',
      event: { type: 'request', payload: request('warmup', '2026-09-07T05:00:00Z') },
    };
    expect(() => replayNavOfflineEvents(frozen, warmup)).toThrow('超出执行处理日');
    const late = structuredClone(result.events);
    late.at(-1)!.evaluationAt = '2026-09-16T00:00:00+08:00';
    expect(() => replayNavOfflineEvents(frozen, late)).toThrow('超出冻结执行边界');
  });
});

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CnNavSimulation,
  tradingDateAfter,
  type CnNavSimulationEvent,
} from '@thesis-ledger/domain';
import { adaptNavDomainInputsV3 } from '../../src/backtest/backtest-nav-domain-input.js';
import { LocalNavSnapshotStore } from '../../src/backtest/backtest-nav-snapshot-store.js';
import { hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { navFreezeFixture } from './nav-freeze.fixtures.js';
import { hashNavRaw } from '../../src/backtest/backtest-nav-freeze-validation.js';

let root: string;
let frozen: Awaited<ReturnType<LocalNavSnapshotStore['replay']>>;
beforeEach(async () => {
  root = await mkdtemp(resolve(tmpdir(), 'nav-domain-'));
  const store = new LocalNavSnapshotStore(root);
  await store.freeze(navFreezeFixture());
  frozen = await store.replay('nav-run');
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('NAV 冻结输入到 Domain', () => {
  it('离线读回保留身份、来源、十进制及完整分段模型', () => {
    const result = adaptNavDomainInputsV3(frozen);
    expect(result.config.executionInstrument).toEqual({
      symbol: '110011.OF',
      market: 'CN',
      assetType: 'fund',
      currency: 'CNY',
    });
    expect(result.config.ledgerConfig.initialCash).toEqual({ CNY: '10000' });
    expect(result.config.executionModel).toEqual(frozen.context.runConfig.executionModel);
    expect(result.config.cutoffLocalTime).toBe('14:00');
    expect(result.facts[1]).toEqual({
      symbol: '110011.OF',
      market: 'CN',
      instrumentType: 'NAV_FUND',
      nav: '1.25',
      valuationDate: '2026-09-08',
      occurredAt: '2026-09-08T07:00:00Z',
      availableAt: '2026-09-08T12:00:00Z',
      provider: 'fixture',
      providerRevision: 'fixture-provider-v1',
      freshness: 'delayed',
      quality: 'complete',
      status: 'supported',
    });
    expect(result.plan.warmupDates).toEqual(['2026-09-07']);
    expect(result.facts).toHaveLength(7);
    expect(result.facts[0]).not.toHaveProperty('open');
  });

  it('按微秒可见性查询且不暴露可变的查询副本', () => {
    const result = adaptNavDomainInputsV3(frozen);
    expect(result.pricingFactAt('2026-09-08', '2026-09-08T11:59:59.999999Z')).toBeUndefined();
    expect(result.pricingFactAt('2026-09-08', '2026-09-08T12:00:00Z')?.nav).toBe('1.25');
    expect(result.pricingFactAt('2026-09-08', '2026-09-30T00:00:00.000002Z')).toBeUndefined();
    expect(result.pricingFactAt('2026-09-22', '2026-09-23T00:00:00Z')).toBeUndefined();
    expect(result.pricingFactAt('2026-09-08', 'invalid')).toBeUndefined();
    result.facts[1]!.nav = '9';
    result.pricingFactAt('2026-09-08', '2026-09-08T12:00:00Z')!.nav = '8';
    frozen.context.runConfig.initialCash.CNY = '1';
    expect(result.config.ledgerConfig.initialCash.CNY).toBe('10000');
    expect(result.pricingFactAt('2026-09-08', '2026-09-08T12:00:00Z')?.nav).toBe('1.25');
  });

  it('独立处理日历跳过非处理日，尾部不足与时段查询拒绝', () => {
    const { calendar } = adaptNavDomainInputsV3(frozen).config;
    expect(calendar.isTradingDay('2026-09-12T04:00:00Z')).toBe(false);
    expect(tradingDateAfter(calendar, '2026-09-11', 2)).toBe('2026-09-15');
    expect(tradingDateAfter(calendar, '2026-09-15', 4)).toBe('2026-09-21');
    expect(() => tradingDateAfter(calendar, '2026-09-21', 1)).toThrow('超出冻结日历');
    expect(() => calendar.sessionsForDate('2026-09-08')).toThrow('未声明交易时段');
  });

  it.each(['symbol', 'cash', 'model', 'hash'])('不符输入拒绝：%s', (kind) => {
    if (kind === 'symbol') frozen.manifest.facts[0]!.symbol = '000001.OF';
    if (kind === 'cash') frozen.context.runConfig.initialCash.CNY = '-1';
    if (kind === 'model') frozen.context.runConfig.executionModel.scope.currency = 'USD';
    if (kind === 'hash') frozen.manifest.contentHash = '0'.repeat(64);
    expect(() => adaptNavDomainInputsV3(frozen)).toThrow();
  });

  it('篡改处理日期不能绕过日历原文绑定', () => {
    const input = navFreezeFixture();
    // 变更是已冻结合同外的无效输入，应在映射前拒绝。
    frozen.context.calendar.tradingDates = input.context.calendar.tradingDates.filter(
      (d) => d !== '2026-09-10',
    );
    expect(() => adaptNavDomainInputsV3(frozen)).toThrow('独立日历');
  });

  it('精确到同一毫秒内的可见性边界，十进制现金不经过浮点转换', async () => {
    const fixture = navFreezeFixture('micro-run');
    fixture.context.runConfig.initialCash.CNY = '10000.123456789012345678';
    fixture.facts[1]!.availableAt = '2026-09-08T12:00:00.000001Z';
    const store = new LocalNavSnapshotStore(root);
    await store.freeze(fixture);
    const adapted = adaptNavDomainInputsV3(await store.replay('micro-run'));
    expect(adapted.config.ledgerConfig.initialCash.CNY).toBe('10000.123456789012345678');
    expect(adapted.pricingFactAt('2026-09-08', '2026-09-08T12:00:00Z')).toBeUndefined();
    expect(adapted.pricingFactAt('2026-09-08', '2026-09-08T12:00:00.000001Z')?.nav).toBe('1.25');
  });

  it('只消费显式处理日，正常交易所工作日也不能补齐', async () => {
    const fixture = navFreezeFixture('closed-day-run');
    const calendar = fixture.context.calendar;
    calendar.tradingDates = calendar.tradingDates.filter((day) => day !== '2026-09-10');
    const { symbol, market, timezone, version, coverage, valuationDates, tradingDates } = calendar;
    fixture.context.calendarRaw = JSON.stringify({
      symbol,
      market,
      timezone,
      version,
      coverage,
      valuationDates,
      tradingDates,
      disclosureWorkDates: calendar.disclosureWorkDates,
    });
    calendar.contentHash = hashNavRaw(fixture.context.calendarRaw);
    const store = new LocalNavSnapshotStore(root);
    await store.freeze(fixture);
    const adapted = adaptNavDomainInputsV3(await store.replay('closed-day-run'));
    expect(adapted.config.calendar.isTradingDay('2026-09-10T04:00:00Z')).toBe(false);
    expect(tradingDateAfter(adapted.config.calendar, '2026-09-09', 1)).toBe('2026-09-11');
  });

  it('申购、赎回消费冻结模型，保留费用、份额和结算金额', () => {
    const input = adaptNavDomainInputsV3(frozen);
    const simulation = new CnNavSimulation(input.config);
    const apply = (event: CnNavSimulationEvent) => {
      const result = simulation.applyEvent(event);
      expect(result, JSON.stringify(result)).toMatchObject({ applied: true });
    };
    const request = (id: string, day: string, redeem: boolean) => {
      const at = `${day}T05:00:00Z`;
      apply({
        type: 'request',
        payload: {
          eventId: `${id}:request`,
          requestId: id,
          requestType: redeem ? 'redeem' : 'subscribe',
          executionSymbol: '110011.OF',
          requestAt: at,
          occurredAt: at,
          availableAt: at,
          ...(redeem ? { shares: '10' } : { amount: '100' }),
        },
      });
      const cutoff = `${day}T06:00:00Z`;
      apply({
        type: 'cutoff',
        payload: {
          eventId: `${id}:cutoff`,
          requestId: id,
          cutoffAt: cutoff,
          valuationDate: day,
          occurredAt: cutoff,
          availableAt: cutoff,
        },
      });
      const fact = input.pricingFactAt(day, `${day}T12:00:00Z`)!;
      apply({ type: 'nav', payload: { eventId: `${id}:nav`, requestId: id, fact } });
    };
    const event = (
      type: 'confirmation' | 'shareAvailable' | 'cashSettlement' | 'redemptionCash',
      id: string,
      at: string,
    ) => {
      const base = { eventId: `${id}:${type}`, requestId: id, occurredAt: at, availableAt: at };
      if (type === 'confirmation') apply({ type, payload: base });
      else if (type === 'shareAvailable') apply({ type, payload: { ...base, shares: '80' } });
      else
        apply({ type, payload: { ...base, amount: type === 'cashSettlement' ? '101' : '12.37' } });
    };
    request('buy', '2026-09-08', false);
    event('confirmation', 'buy', '2026-09-09T01:00:00Z');
    event('cashSettlement', 'buy', '2026-09-09T01:00:00Z');
    event('shareAvailable', 'buy', '2026-09-10T01:00:00Z');
    request('sell', '2026-09-10', true);
    event('confirmation', 'sell', '2026-09-11T01:00:00Z');
    event('redemptionCash', 'sell', '2026-09-15T01:00:00Z');
    const state = simulation.snapshot();
    expect(state.ledger.position.quantity).toBe('70');
    expect(state.ledger.cash.CNY.settled).toBe('9911.37');
    expect(state.requests.find((r) => r.requestId === 'buy')).toMatchObject({
      fee: '1',
      confirmedShares: '80',
      expectedCashSettlement: '101',
    });
    expect(state.requests.find((r) => r.requestId === 'sell')).toMatchObject({
      fee: '0.13',
      confirmedShares: '10',
      expectedCashSettlement: '12.37',
    });
    expect(hashCanonicalManifest(input.config.executionModel)).toBe(
      frozen.manifest.executionModel.contentHash,
    );
  });
});

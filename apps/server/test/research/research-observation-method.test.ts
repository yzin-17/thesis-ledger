import { describe, expect, it } from 'vitest';
import {
  evaluateObservationPrices,
  selectObservationWindow,
} from '../../src/research/research-observation-method.js';
import { observationMethodFixture } from './research-observation-method.fixture.js';

describe('固定交易日观察窗口', () => {
  it('日历晚于截止点一纳秒时保持未知', () => {
    const { input, fact } = observationMethodFixture();
    fact.availableAt = '2026-11-30T08:00:00.000000001Z';
    expect(selectObservationWindow(input).reasons).toEqual(['calendar_unqualified']);
  });
  it('精确比较收盘、生成及截止时刻，不丢弃小数秒', () => {
    const { input, fact } = observationMethodFixture();
    const session = fact.sessions.find((value) => value.endAt === '2026-10-16T07:00:00Z')!;
    session.endAt = '2026-10-16T07:00:00.000000001Z';
    expect(
      selectObservationWindow({ ...input, createdAt: '2026-10-16T07:00:00Z' }).window,
    ).toMatchObject({ startSession: '2026-10-16', endSession: '2026-10-23' });
    const end = fact.sessions.find((value) => value.endAt === '2026-10-26T07:00:00Z')!;
    end.endAt = '2026-10-26T07:00:00.000000001Z';
    expect(selectObservationWindow({ ...input, asOf: '2026-10-26T07:00:00Z' }).status).toBe(
      'not_due',
    );
  });
  it.each([
    ['2026-10-16T03:00:00Z', '2026-10-16', '2026-10-23'],
    ['2026-10-16T07:00:00Z', '2026-10-19', '2026-10-26'],
    ['2026-10-16T08:00:00Z', '2026-10-19', '2026-10-26'],
    ['2026-10-17T03:00:00Z', '2026-10-19', '2026-10-26'],
    ['2026-10-01T03:00:00Z', '2026-10-09', '2026-10-16'],
  ])('生成于 %s 时不计入第零日', (createdAt, startSession, endSession) => {
    const { input } = observationMethodFixture();
    expect(selectObservationWindow({ ...input, createdAt }).window).toMatchObject({
      tradingDays: 5,
      startSession,
      endSession,
    });
  });
  it('二十交易日窗口、未到期、覆盖不足及未来日历分别保持状态', () => {
    const { input, fact } = observationMethodFixture(20);
    expect(selectObservationWindow(input).window.endSession).toBe('2026-11-16');
    expect(selectObservationWindow({ ...input, asOf: '2026-10-20T08:00:00Z' }).status).toBe(
      'not_due',
    );
    expect(
      selectObservationWindow({
        ...input,
        calendar: {
          status: 'ready',
          calendar: {
            ...fact,
            coverageEnd: '2026-10-20',
            sessions: fact.sessions.filter((session) => session.tradingDate <= '2026-10-20'),
          },
        },
      }).reasons,
    ).toEqual(['calendar_incomplete']);
    expect(
      selectObservationWindow({
        ...input,
        calendar: { status: 'ready', calendar: { ...fact, availableAt: '2026-12-30T00:00:00Z' } },
      }).reasons,
    ).toEqual(['calendar_unqualified']);
  });
  it('美国冬令时变化使用市场实际 Session 收盘，不按固定 UTC 时刻推算', () => {
    const { input, fact } = observationMethodFixture();
    const dates = [
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
    ];
    const sessions = dates.map((date) => ({
      tradingDate: date,
      startAt: date + (date < '2026-11-01' ? 'T13:30:00Z' : 'T14:30:00Z'),
      endAt: date + (date < '2026-11-01' ? 'T20:00:00Z' : 'T21:00:00Z'),
    }));
    const selected = selectObservationWindow({
      ...input,
      market: 'US',
      createdAt: '2026-10-28T14:00:00Z',
      calendar: {
        status: 'ready',
        calendar: { ...fact, market: 'US', timezone: 'America/New_York', sessions },
      },
    });
    expect(selected.window).toMatchObject({
      startSession: dates[0],
      endSession: dates[5],
      endCloseAt: '2026-11-04T21:00:00Z',
    });
  });
  it('不明确论点不调用价格方法，错误市场时区不能获得窗口', () => {
    const { input, fact } = observationMethodFixture();
    const claim = {
      id: 'manual',
      kind: 'qualitative' as const,
      description: '人工查看',
      evidenceIds: [],
      rationale: '无方向期限',
    };
    expect(selectObservationWindow({ ...input, claim }).status).toBe('not_applicable');
    expect(
      selectObservationWindow({
        ...input,
        calendar: { status: 'ready', calendar: { ...fact, timezone: 'America/New_York' } },
      }).status,
    ).toBe('insufficient_data');
  });
});

describe('经济价格两端复核', () => {
  it('按原币经济收盘计算；零变化不算方向命中', () => {
    const { input, claim, prices } = observationMethodFixture();
    const window = selectObservationWindow(input);
    expect(evaluateObservationPrices(window, claim, input.asOf, prices).economic).toMatchObject({
      returnRate: '0.1',
      directionMatched: true,
      currency: 'CNY',
    });
    if (prices.status !== 'ready') throw Error('受控价格无效');
    prices.points[1]!.close = '100';
    expect(evaluateObservationPrices(window, claim, input.asOf, prices).economic).toMatchObject({
      returnRate: '0',
      directionMatched: false,
    });
    prices.points[1]!.close = '90';
    expect(
      evaluateObservationPrices(window, { ...claim, direction: 'down' }, input.asOf, prices)
        .economic.directionMatched,
    ).toBe(true);
  });
  it.each(['missing', 'suspended', 'unknown', 'late'] as const)(
    '%s 端点保留未知且不向后找价格',
    (kind) => {
      const { input, claim, prices } = observationMethodFixture();
      if (prices.status !== 'ready') throw Error('受控价格无效');
      if (kind === 'missing')
        prices.points = [prices.points[0]!, { ...prices.points[1]!, date: '2026-10-27' }];
      else if (kind === 'late') prices.points[1]!.availableAt = '2026-12-01T00:00:00Z';
      else prices.points[1]!.state = kind;
      const result = evaluateObservationPrices(
        selectObservationWindow(input),
        claim,
        input.asOf,
        prices,
      );
      expect(result.status).toBe('insufficient_data');
      expect(result.economic.returnRate).toBeNull();
      expect(result.window.endSession).toBe('2026-10-26');
    },
  );
  it.each([
    ['2026-11-30T08:00:00.000000001Z', 'insufficient_data'],
    ['2026-11-30T15:59:59.999999999+08:00', 'completed'],
    ['2026-11-30T16:00:00.000000000+08:00', 'completed'],
    ['2026-02-30T08:00:00Z', 'insufficient_data'],
    ['2026-11-30T08:00:00-00:00', 'insufficient_data'],
  ] as const)('端点证据时刻 %s 保留精度及偏移语义', (availableAt, status) => {
    const { input, claim, prices } = observationMethodFixture();
    if (prices.status !== 'ready') throw Error('受控价格无效');
    prices.points[1]!.availableAt = availableAt;
    const result = evaluateObservationPrices(
      selectObservationWindow(input),
      claim,
      input.asOf,
      prices,
    );
    expect(result.status).toBe(status);
    if (status === 'insufficient_data') expect(result.economic.returnRate).toBeNull();
  });
  it('无效截止时刻不能得到经济结果', () => {
    const { input, claim, prices } = observationMethodFixture();
    expect(
      evaluateObservationPrices(selectObservationWindow(input), claim, 'invalid', prices).status,
    ).toBe('insufficient_data');
  });
  it('未到期或价格基准未知不会产生经济结果', () => {
    const { input, claim, prices } = observationMethodFixture();
    const window = selectObservationWindow({ ...input, asOf: '2026-10-20T08:00:00Z' });
    expect(evaluateObservationPrices(window, claim, input.asOf, prices).status).toBe('not_due');
    const unavailable = evaluateObservationPrices(
      selectObservationWindow(input),
      claim,
      input.asOf,
      { status: 'unavailable', reason: 'price_basis_unknown' },
    );
    expect(unavailable.reasons).toEqual(['price_basis_unknown']);
    expect(unavailable.economic.directionMatched).toBeNull();
  });
});

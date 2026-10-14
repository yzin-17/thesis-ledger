import { describe, expect, it, vi } from 'vitest';
import {
  aggregateMarketDailyBars,
  canonicalMarketPeriodEncoding,
} from '../src/market-period-aggregation.js';
import { MarketPeriodAggregationError } from '../src/market-period-calendar.js';
import type {
  MARKET_PERIOD_RULE_VERSION,
  MarketPeriodAggregationInput,
} from '../src/market-period-types.js';
import {
  calendarFixture,
  dailyFixture,
  inputFixture,
  suspensionFixture,
} from './fixtures/market-period.fixture.js';

describe('行情周期聚合 golden', () => {
  it('任一日缺量额时周期量额保持未知，价格聚合仍可用', () => {
    const input = inputFixture();
    const bars = input.bars.map((bar, index) => index === 0 ? { ...bar, volume: null, amount: null } : bar);
    const result = aggregateMarketDailyBars({ ...input, bars });
    expect(result.points[0]).toMatchObject({ open: 10, close: 15, volume: null, amount: null });
  });
  it('按首末 OHLC 与总量聚合完整周，输出末计划 Session 时间', () => {
    expect(aggregateMarketDailyBars(inputFixture()).points).toEqual([
      {
        timestamp: '2026-09-11T07:00:00.000Z',
        tradingDate: '2026-09-11',
        bucketStartDate: '2026-09-07',
        bucketEndDate: '2026-09-13',
        bucketEndAt: '2026-09-11T07:00:00.000Z',
        open: 10,
        high: 16,
        low: 9,
        close: 15,
        volume: 60,
        amount: 6000,
        completionStatus: 'complete',
        availableAt: '2026-09-11T07:00:00.000Z',
        expectedTradingDates: [
          '2026-09-07',
          '2026-09-08',
          '2026-09-09',
          '2026-09-10',
          '2026-09-11',
        ],
        observedTradingDates: [
          '2026-09-07',
          '2026-09-08',
          '2026-09-09',
          '2026-09-10',
          '2026-09-11',
        ],
        explainedTradingDates: [],
        missingTradingDates: [],
      },
    ]);
  });
  it('周桶跨月/跨年，不依赖请求已有日线起点', () => {
    const calendar = calendarFixture('2025-12-29', '2026-01-04');
    const point = aggregateMarketDailyBars(inputFixture({ calendar })).points[0]!;
    expect([point.bucketStartDate, point.bucketEndDate, point.tradingDate, point.volume]).toEqual([
      '2025-12-29',
      '2026-01-04',
      '2026-01-02',
      60,
    ]);
    const crossMonth = aggregateMarketDailyBars(
      inputFixture({ calendar: calendarFixture('2026-08-31', '2026-09-06') }),
    ).points[0]!;
    expect(crossMonth.bucketStartDate).toBe('2026-08-31');
    expect(crossMonth.bucketEndDate).toBe('2026-09-06');
  });
  it.each(['1mo', '1y'] as const)('%s 采用自然边界，不随日线窗口裁短', (timeframe) => {
    const calendar = calendarFixture('2026-01-01', '2026-12-31');
    const bars = [dailyFixture('2026-09-07')];
    const point = aggregateMarketDailyBars(inputFixture({ timeframe, calendar, bars })).points[0]!;
    expect(point.bucketStartDate).toBe(timeframe === '1mo' ? '2026-09-01' : '2026-01-01');
    expect(point.bucketEndDate).toBe(timeframe === '1mo' ? '2026-09-30' : '2026-12-31');
    expect(point.completionStatus).toBe('unknown');
  });
  it('五日按显式锚点倒数计划交易日，移动锚点改变桶', () => {
    const calendar = calendarFixture('2026-09-01', '2026-09-13');
    const first = aggregateMarketDailyBars(
      inputFixture({
        calendar,
        timeframe: '5d',
        anchorTradingDate: '2026-09-11',
        bars: ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'].map((date) =>
          dailyFixture(date),
        ),
      }),
    );
    const shifted = aggregateMarketDailyBars(
      inputFixture({
        calendar,
        timeframe: '5d',
        anchorTradingDate: '2026-09-10',
        bars: ['2026-09-04', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10'].map((date) =>
          dailyFixture(date),
        ),
      }),
    );
    expect(first.points[0]!.expectedTradingDates).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
    ]);
    expect(shifted.points[0]!.expectedTradingDates).toEqual([
      '2026-09-04',
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
    ]);
    expect(first.points[0]!.timestamp).not.toBe(shifted.points[0]!.timestamp);
  });
  it('五日跳过日历证明的休市日，不以五个自然日替代', () => {
    const calendar = calendarFixture('2026-09-01', '2026-09-13', ['2026-09-09']);
    const bars = ['2026-09-04', '2026-09-07', '2026-09-08', '2026-09-10', '2026-09-11'].map(
      (date) => dailyFixture(date),
    );
    const point = aggregateMarketDailyBars(
      inputFixture({ calendar, bars, timeframe: '5d', anchorTradingDate: '2026-09-11' }),
    ).points[0]!;
    expect(point.expectedTradingDates).toEqual(bars.map((bar) => bar.tradingDate));
    expect(point.completionStatus).toBe('complete');
  });
  it('分段 Session 与半日市从最后计划 Session 求结束时刻', () => {
    const original = calendarFixture();
    const calendar = {
      ...original,
      sessions: original.sessions.flatMap((session) => {
        if (session.tradingDate === '2026-09-11')
          return [{ ...session, endAt: '2026-09-11T04:00:00.000Z' }];
        return [
          { ...session, endAt: `${session.tradingDate}T03:30:00.000Z` },
          { ...session, startAt: `${session.tradingDate}T05:00:00.000Z` },
        ];
      }),
    };
    const bars = original.sessions.map((session) => dailyFixture(session.tradingDate));
    const point = aggregateMarketDailyBars(inputFixture({ calendar, bars })).points[0]!;
    expect(point.bucketEndAt).toBe('2026-09-11T04:00:00.000Z');
    expect(point.availableAt).toBe('2026-09-11T07:00:00.000Z');
    expect(point.expectedTradingDates).toHaveLength(5);
  });
  it('使用市场 Session 时区，US 收盘跨上海日期不改变周一桶起点', () => {
    const original = calendarFixture();
    const calendar = {
      ...original,
      market: 'US' as const,
      timezone: 'America/New_York',
      sessions: original.sessions.map((session) => ({
        ...session,
        startAt: `${session.tradingDate}T13:30:00.000Z`,
        endAt: `${session.tradingDate}T20:00:00.000Z`,
      })),
    };
    const bars = calendar.sessions.map((session) => ({
      ...dailyFixture(session.tradingDate),
      timestamp: session.endAt,
      availableAt: session.endAt,
    }));
    const point = aggregateMarketDailyBars(inputFixture({ calendar, bars })).points[0]!;
    expect(point.bucketStartDate).toBe('2026-09-07');
    expect(point.tradingDate).toBe('2026-09-11');
    expect(point.timestamp).toBe('2026-09-11T20:00:00.000Z');
  });
  it('日历关闭周五时使用周四 Session，不等待不存在的交易', () => {
    const calendar = calendarFixture('2026-09-07', '2026-09-13', ['2026-09-11']);
    const point = aggregateMarketDailyBars(
      inputFixture({ calendar, evaluationAsOf: '2026-09-10T07:00:00.000Z' }),
    ).points[0]!;
    expect(point.completionStatus).toBe('complete');
    expect(point.bucketEndAt).toBe('2026-09-10T07:00:00.000Z');
  });
  it('没有日线的桶不出 bar，也不把停牌补零', () => {
    expect(
      aggregateMarketDailyBars(inputFixture({ bars: [], noTradingEvidence: [suspensionFixture()] }))
        .points,
    ).toEqual([]);
    const bars = inputFixture().bars.filter((bar) => bar.tradingDate !== '2026-09-09');
    const point = aggregateMarketDailyBars(
      inputFixture({ bars, noTradingEvidence: [suspensionFixture()] }),
    ).points[0]!;
    expect(point.volume).toBe(48);
    expect(point.observedTradingDates).toHaveLength(4);
    expect(point.explainedTradingDates).toEqual(['2026-09-09']);
    expect(point.completionStatus).toBe('complete');
  });
  it('可得时刻保留晚到必要覆盖证据', () => {
    const bars = inputFixture().bars.filter((bar) => bar.tradingDate !== '2026-09-09');
    const evidence = { ...suspensionFixture(), availableAt: '2026-09-12T01:00:00.000Z' };
    const point = aggregateMarketDailyBars(inputFixture({ bars, noTradingEvidence: [evidence] }))
      .points[0]!;
    expect(point.availableAt).toBe(evidence.availableAt);
  });
  it('排序与完全相同重复日线/Session 不改变输出', () => {
    const original = inputFixture();
    const duplicate = {
      ...original,
      bars: [...original.bars].reverse().concat(original.bars[0]!),
      calendar: {
        ...original.calendar,
        sessions: [...original.calendar.sessions].reverse().concat(original.calendar.sessions[0]!),
      },
    };
    expect(aggregateMarketDailyBars(duplicate)).toEqual(aggregateMarketDailyBars(original));
  });
});

describe('行情周期完成状态与拒绝路径', () => {
  it('周二完整日线只能产生 incomplete 周线，时间戳保持周末计划边界', () => {
    const input = inputFixture({
      evaluationAsOf: '2026-09-08T07:00:00.000Z',
      bars: [dailyFixture('2026-09-07'), dailyFixture('2026-09-08')],
    });
    const point = aggregateMarketDailyBars(input).points[0]!;
    expect(point.completionStatus).toBe('incomplete');
    expect(point.availableAt).toBe(input.evaluationAsOf);
    expect(point.timestamp).toBe('2026-09-11T07:00:00.000Z');
  });
  it.each(['1mo', '1y'] as const)('当前 %s 未结束且到期输入完整时仍 incomplete', (timeframe) => {
    const calendar = calendarFixture('2026-01-01', '2026-12-31');
    const input = inputFixture({
      calendar,
      timeframe,
      evaluationAsOf: '2026-09-08T07:00:00.000Z',
      bars: calendar.sessions
        .filter((session) => session.tradingDate <= '2026-09-08')
        .map((session) => dailyFixture(session.tradingDate)),
    });
    expect(aggregateMarketDailyBars(input).points.at(-1)!.completionStatus).toBe('incomplete');
  });
  it.each([
    ['2026-09-11T06:59:59.999Z', 'incomplete'],
    ['2026-09-11T07:00:00.000Z', 'complete'],
    ['2026-09-11T07:00:00.001Z', 'complete'],
  ] as const)('最后计划 Session 边界 %s => %s', (evaluationAsOf, expected) => {
    const bars = inputFixture().bars.filter((bar) => bar.tradingDate !== '2026-09-11');
    const evidence = {
      ...suspensionFixture('2026-09-11'),
      availableAt: '2026-09-11T06:00:00.000Z',
    };
    const point = aggregateMarketDailyBars(
      inputFixture({ bars, noTradingEvidence: [evidence], evaluationAsOf }),
    ).points[0]!;
    expect(point.completionStatus).toBe(expected);
    if (expected === 'complete') expect(point.availableAt).toBe('2026-09-11T07:00:00.000Z');
    else expect(point.availableAt).toBe(evidence.availableAt);
  });
  it('无解释的过去缺日为 unknown，不能当停牌', () => {
    const bars = inputFixture().bars.filter((bar) => bar.tradingDate !== '2026-09-09');
    const point = aggregateMarketDailyBars(inputFixture({ bars })).points[0]!;
    expect(point.completionStatus).toBe('unknown');
    expect(point.missingTradingDates).toEqual(['2026-09-09']);
  });
  it.each(['incomplete', 'unknown'] as const)('已到期日线 %s 向桶传播', (completionStatus) => {
    const bars = inputFixture().bars.map((bar, index) =>
      index === 0 ? { ...bar, completionStatus } : bar,
    );
    expect(aggregateMarketDailyBars(inputFixture({ bars })).points[0]!.completionStatus).toBe(
      completionStatus,
    );
  });
  it.each(['adjustment', 'priceBasisFingerprint', 'symbol'] as const)('拒绝混合 %s', (field) => {
    const bars = inputFixture().bars.map((bar, index) =>
      index === 0 ? { ...bar, [field]: field === 'adjustment' ? 'qfq' : 'wrong' } : bar,
    );
    expect(() => aggregateMarketDailyBars(inputFixture({ bars }))).toThrow(
      '日线证券、复权及完整口径必须一致',
    );
  });
  it('拒绝同一交易日冲突及日线与无交易证据矛盾', () => {
    const original = inputFixture();
    expect(() =>
      aggregateMarketDailyBars({
        ...original,
        bars: [...original.bars, { ...original.bars[0]!, close: 10 }],
      }),
    ).toThrow('日线冲突');
    expect(() =>
      aggregateMarketDailyBars({ ...original, noTradingEvidence: [suspensionFixture()] }),
    ).toThrow('互相矛盾');
  });
  it('无交易证据顺序和相同重复稳定，冲突或失配则拒绝', () => {
    const original = inputFixture();
    const evidence = [suspensionFixture('2026-09-09'), suspensionFixture('2026-09-10')];
    const bars = original.bars.filter(
      (bar) => !evidence.some((item) => item.tradingDate === bar.tradingDate),
    );
    const baseline = aggregateMarketDailyBars({ ...original, bars, noTradingEvidence: evidence });
    expect(
      aggregateMarketDailyBars({
        ...original,
        bars,
        noTradingEvidence: [...evidence].reverse().concat(evidence[0]!),
      }),
    ).toEqual(baseline);
    expect(() =>
      aggregateMarketDailyBars({
        ...original,
        bars,
        noTradingEvidence: [evidence[0]!, { ...evidence[0]!, revision: 'other' }],
      }),
    ).toThrow('覆盖证据冲突');
    expect(() =>
      aggregateMarketDailyBars({
        ...original,
        bars,
        noTradingEvidence: [{ ...evidence[0]!, baseInputFingerprint: 'c'.repeat(64) }],
      }),
    ).toThrow('覆盖证据没有绑定');
  });
  it.each(['calendar', 'bar', 'evidence'] as const)('拒绝评估后可得的 %s', (kind) => {
    const future = '2027-01-01T00:00:00.000Z';
    let input = inputFixture();
    if (kind === 'calendar')
      input = { ...input, calendar: { ...input.calendar, availableAt: future } };
    else if (kind === 'bar')
      input = {
        ...input,
        bars: input.bars.map((bar, index) => (index === 0 ? { ...bar, availableAt: future } : bar)),
      };
    else
      input = {
        ...input,
        bars: input.bars.filter((bar) => bar.tradingDate !== '2026-09-09'),
        noTradingEvidence: [{ ...suspensionFixture(), availableAt: future }],
      };
    expect(() => aggregateMarketDailyBars(input)).toThrowError(MarketPeriodAggregationError);
    try {
      aggregateMarketDailyBars(input);
    } catch (error) {
      expect((error as MarketPeriodAggregationError).code).toBe('future_evidence');
    }
  });
  it('拒绝不足整个桶的日历和不足五日的边缘片段', () => {
    expect(() =>
      aggregateMarketDailyBars(
        inputFixture({ calendar: calendarFixture('2026-09-08', '2026-09-13') }),
      ),
    ).toThrow('日历未覆盖整个周期');
    expect(() =>
      aggregateMarketDailyBars(
        inputFixture({
          timeframe: '5d',
          anchorTradingDate: '2026-09-08',
          bars: [dailyFixture('2026-09-07'), dailyFixture('2026-09-08')],
        }),
      ),
    ).toThrow('不足五个计划交易日');
  });
  it('拒绝缺失锚点、错误规则版本、无效数值及重叠 Session', () => {
    expect(() => aggregateMarketDailyBars(inputFixture({ timeframe: '5d' }))).toThrow(
      '必须显式指定锚点',
    );
    expect(() =>
      aggregateMarketDailyBars(
        inputFixture({ ruleVersion: 'r2' as typeof MARKET_PERIOD_RULE_VERSION }),
      ),
    ).toThrow('规则版本');
    expect(() =>
      aggregateMarketDailyBars(
        inputFixture({ bars: [{ ...dailyFixture('2026-09-07'), volume: NaN }] }),
      ),
    ).toThrow('无效日线数值');
    const calendar = calendarFixture();
    expect(() =>
      aggregateMarketDailyBars(
        inputFixture({
          calendar: {
            ...calendar,
            sessions: [
              ...calendar.sessions,
              { ...calendar.sessions[0]!, startAt: '2026-09-07T02:00:00.000Z' },
            ],
          },
        }),
      ),
    ).toThrow('Session 重叠');
  });
  it('固定评估时刻不读取系统时钟，且不修改输入', () => {
    const original = inputFixture();
    const snapshot = structuredClone(original);
    const before = canonicalMarketPeriodEncoding(aggregateMarketDailyBars(original));
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('禁止读取系统时钟');
    });
    try {
      expect(canonicalMarketPeriodEncoding(aggregateMarketDailyBars(original))).toBe(before);
    } finally {
      clock.mockRestore();
    }
    expect(original).toEqual(snapshot);
  });
  it('编码绑定评估时刻、日历版本、价格口径、基础输入和证据 revision', () => {
    const input = inputFixture();
    const encoding = canonicalMarketPeriodEncoding(aggregateMarketDailyBars(input));
    expect(
      canonicalMarketPeriodEncoding(
        aggregateMarketDailyBars({ ...input, evaluationAsOf: '2026-09-15T00:00:00.000Z' }),
      ),
    ).not.toBe(encoding);
    expect(
      canonicalMarketPeriodEncoding(
        aggregateMarketDailyBars({
          ...input,
          calendar: { ...input.calendar, revision: 'calendar-r2' },
        }),
      ),
    ).not.toBe(encoding);
    expect(
      canonicalMarketPeriodEncoding(
        aggregateMarketDailyBars({ ...input, baseInputFingerprint: 'c'.repeat(64) }),
      ),
    ).not.toBe(encoding);
    expect(
      canonicalMarketPeriodEncoding(
        aggregateMarketDailyBars({
          ...input,
          priceBasisFingerprint: 'c'.repeat(64),
          bars: input.bars.map((bar) => ({ ...bar, priceBasisFingerprint: 'c'.repeat(64) })),
        }),
      ),
    ).not.toBe(encoding);
    const suspended = {
      ...input,
      bars: input.bars.filter((bar) => bar.tradingDate !== '2026-09-09'),
      noTradingEvidence: [suspensionFixture()],
    };
    const baseline = canonicalMarketPeriodEncoding(aggregateMarketDailyBars(suspended));
    expect(
      canonicalMarketPeriodEncoding(
        aggregateMarketDailyBars({
          ...suspended,
          noTradingEvidence: [{ ...suspensionFixture(), revision: 'suspension-r2' }],
        }),
      ),
    ).not.toBe(baseline);
  });
  it('错误复权类型不能通过强制类型转换绕过领域边界', () => {
    const invalid = {
      ...inputFixture(),
      adjustment: 'invalid',
    } as unknown as MarketPeriodAggregationInput;
    expect(() => aggregateMarketDailyBars(invalid)).toThrow('复权');
  });
  it('拒绝提前完整日线、无效日期与成交量溢出', () => {
    expect(() =>
      aggregateMarketDailyBars(
        inputFixture({
          bars: [{ ...dailyFixture('2026-09-07'), availableAt: '2026-09-07T06:00:00.000Z' }],
        }),
      ),
    ).toThrow('完整状态不能早于');
    expect(() =>
      aggregateMarketDailyBars(
        inputFixture({ bars: [{ ...dailyFixture('2026-09-07'), tradingDate: '2026-02-30' }] }),
      ),
    ).toThrow('无效交易日');
    expect(() =>
      aggregateMarketDailyBars(
        inputFixture({
          bars: inputFixture().bars.map((bar) => ({ ...bar, volume: Number.MAX_VALUE })),
        }),
      ),
    ).toThrow('溢出');
  });
});

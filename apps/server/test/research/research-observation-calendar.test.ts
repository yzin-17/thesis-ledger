import { describe, expect, it, vi } from 'vitest';
import { ResearchObservationMaterials } from '../../src/research/research-observation-materials.js';
import { selectObservationWindow } from '../../src/research/research-observation-method.js';
import { observationMarketFixture } from './research-observation-market.fixture.js';

/** 有界合成日历只验证读取需求，不声明实际经济价格资格。 */
function fixture(tradingDays: 5 | 20 = 5, createdAt = '2026-10-23T15:36:51.300Z') {
  const sample = observationMarketFixture();
  const source = sample.method.calendar;
  if (source.status !== 'ready') throw Error('受控日历应就绪');
  const read = vi.fn(async (request: { start: string; end: string }) => {
    if (request.end > source.calendar.coverageEnd)
      return { status: 'unavailable' as const, reason: 'calendar_incomplete' as const };
    return {
      status: 'ready' as const,
      calendar: {
        ...source.calendar,
        coverageStart: request.start,
        coverageEnd: request.end,
        sessions: source.calendar.sessions.filter(
          (session) => session.tradingDate >= request.start && session.tradingDate <= request.end,
        ),
      },
    };
  });
  const prices = vi.fn();
  const reader = new ResearchObservationMaterials({ read } as never, { readV3: prices } as never);
  const input = {
    ...sample.method.input,
    createdAt,
    asOf: '2026-10-31T14:00:00Z',
    claim: { ...sample.method.claim, tradingDays },
  };
  return { read, prices, reader, input, instrument: sample.instrument };
}

describe('复核日历只取得实际交易日需求', () => {
  it.each([
    [5, '2026-11-02', ['2026-10-28', '2026-10-31', '2026-11-01', '2026-11-02']],
    [20, '2026-11-23', ['2026-11-12', '2026-11-19', '2026-11-21', '2026-11-22', '2026-11-23']],
  ] as const)('%s日窗口不依赖无关未来月份且不提前到期', async (days, end, reads) => {
    const sample = fixture(days);
    const result = await sample.reader.calendar(
      sample.instrument,
      sample.input.createdAt,
      sample.input.asOf,
      days,
    );
    expect(result.material.status).toBe('ready');
    expect(sample.read.mock.calls.map(([request]) => request.end)).toEqual(reads);
    const window = selectObservationWindow({ ...sample.input, calendar: result.material });
    expect(window.status).toBe('not_due');
    expect(window.window.startSession).toBe('2026-10-26');
    expect(window.window.endSession).toBe(end);
    expect(sample.prices).not.toHaveBeenCalled();
  });

  it.each([
    ['2026-10-23T03:30:00.000000001Z', '2026-10-23', '2026-10-30'],
    ['2026-10-23T06:59:59.999999999Z', '2026-10-23', '2026-10-30'],
    ['2026-10-23T07:00:00.000000000Z', '2026-10-26', '2026-11-02'],
  ])('分段日历在%s保持原始精度及第零日', async (createdAt, start, end) => {
    const sample = fixture(5, createdAt);
    const result = await sample.reader.calendar(sample.instrument, createdAt, sample.input.asOf, 5);
    const window = selectObservationWindow({ ...sample.input, calendar: result.material });
    expect(window.window.startSession).toBe(start);
    expect(window.window.endSession).toBe(end);
  });

  it('来源失败立即停止，不把失败当成交易日不足继续请求', async () => {
    const sample = fixture();
    sample.read.mockResolvedValue({
      status: 'unavailable',
      reason: 'calendar_unavailable',
    } as never);
    const result = await sample.reader.calendar(
      sample.instrument,
      sample.input.createdAt,
      sample.input.asOf,
      5,
    );
    expect(result.material).toEqual({ status: 'unavailable', reason: 'calendar_unavailable' });
    expect(sample.read).toHaveBeenCalledTimes(1);
    expect(sample.prices).not.toHaveBeenCalled();
  });

  it('长期无交易日仍以原120自然日上限收敛为资料不足', async () => {
    const sample = fixture();
    const base = observationMarketFixture().method.calendar;
    if (base.status !== 'ready') throw Error('受控日历应就绪');
    sample.read.mockImplementation(async (request) => ({
      status: 'ready',
      calendar: {
        ...base.calendar,
        coverageStart: request.start,
        coverageEnd: request.end,
        sessions: [],
      },
    }));
    const result = await sample.reader.calendar(
      sample.instrument,
      sample.input.createdAt,
      sample.input.asOf,
      5,
    );
    expect(result.material).toEqual({ status: 'unavailable', reason: 'calendar_incomplete' });
    expect(sample.read.mock.calls.every(([request]) => request.end <= '2027-02-20')).toBe(true);
    expect(sample.read.mock.calls.length).toBeLessThanOrEqual(121);
  });
});

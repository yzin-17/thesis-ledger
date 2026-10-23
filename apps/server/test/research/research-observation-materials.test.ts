import { describe, expect, it, vi } from 'vitest';
import { ResearchObservationMaterials } from '../../src/research/research-observation-materials.js';
import { selectObservationWindow } from '../../src/research/research-observation-method.js';
import { observationMarketFixture } from './research-observation-market.fixture.js';

function fixture() {
  const sample = observationMarketFixture();
  const calendar = vi.fn(async () => sample.method.calendar);
  const prices = vi.fn(async () => sample.selected);
  const reader = new ResearchObservationMaterials(
    { read: calendar } as never,
    { readV3: prices } as never,
  );
  const window = selectObservationWindow(sample.method.input).window;
  return {
    ...sample,
    calendar,
    prices,
    reader,
    read: () =>
      reader.prices(sample.instrument, window, sample.method.calendar, sample.method.input.asOf),
  };
}
describe('复核材料消费现行 Market 合同', () => {
  it('精确窗口、来源、经济基准与日历一致后才提供合成计算输入', async () => {
    const sample = fixture();
    expect((await sample.read()).material.status).toBe('ready');
    expect(sample.prices).toHaveBeenCalledWith(
      expect.objectContaining({
        window: { start: '2026-10-19', end: '2026-10-26' },
        priceResearch: true,
      }),
    );
  });
  it.each([
    'unknown_basis',
    'future_basis',
    'mismatched_target',
    'mismatched_evidence',
    'calendar_gap',
  ])('%s 不能仅凭 selected 状态获得经济价格资格', async (kind) => {
    const sample = fixture();
    if (kind === 'unknown_basis') sample.data.sourcePriceBasis.dividendMeaning = 'provider-defined';
    else if (kind === 'future_basis')
      sample.data.sourcePriceBasis.observedAt = '2026-12-30T00:00:00Z';
    else if (kind === 'mismatched_target')
      sample.selected.selection.target = {
        ...sample.selected.selection.target,
        providerId: 'other',
      };
    else if (kind === 'mismatched_evidence') sample.selected.evidence.inputFingerprint = 'other';
    else
      sample.data.coverageProof.calendar.expectedSessionDates =
        sample.data.coverageProof.calendar.expectedSessionDates.slice(1);
    expect((await sample.read()).material.status).toBe('unavailable');
  });
  it.each([
    ['2026-11-30T08:00:00.000000001Z', 'unavailable'],
    ['2026-11-30T16:00:00.000000000+08:00', 'ready'],
    ['2026-11-30T08:00:00-00:00', 'unavailable'],
  ] as const)('经济基准时刻 %s 不经毫秒截断取得资格', async (observedAt, status) => {
    const sample = fixture();
    sample.data.sourcePriceBasis.observedAt = observedAt;
    expect((await sample.read()).material.status).toBe(status);
  });
  it('没有现行正向日历端口的市场直接保留未知，不发起替代来源请求', async () => {
    const sample = fixture();
    const result = await sample.reader.calendar(
      { ...sample.instrument, market: 'US', currency: 'USD' },
      sample.method.input.createdAt,
      sample.method.input.asOf,
    );
    expect(result.material).toEqual({ status: 'unavailable', reason: 'calendar_unqualified' });
    expect(sample.calendar).not.toHaveBeenCalled();
    expect(sample.prices).not.toHaveBeenCalled();
  });
  it('零成交量只标记端点未知，不把缺失或假设当成已核实停牌', async () => {
    const sample = fixture();
    sample.data.bars.at(-1)!.volume = 0;
    const result = await sample.read();
    if (result.material.status !== 'ready') throw Error('受控输入应保留端点观察');
    expect(result.material.points.at(-1)!.state).toBe('unknown');
  });
});

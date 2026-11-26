import { describe, expect, it, vi } from 'vitest';
import type { MarketAnnouncement, MarketAnnouncements } from '@thesis-ledger/schemas';
import { planBacktestDependencies } from '../../src/backtest/backtest-dependency-plan.js';
import { expectedSnapshotDependencyRequestsV3 } from '../../src/backtest/backtest-snapshot-v3-dependencies.js';
import {
  collectSnapshotEventsV3,
  validateSnapshotEventsV3,
} from '../../src/backtest/backtest-snapshot-v3-events.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { eventRevisions, snapshotEventDsaFixture } from './snapshot-event-dsa-v3.fixtures.js';

async function fixture() {
  const {
    input: { strategy, runConfig },
  } = await completeSnapshotFixture('stock');
  delete runConfig.priceInputBindings;
  const protocol = runConfig.executionPriceProtocol;
  protocol.accountingBasis = 'raw-events';
  Object.assign(protocol.priceBasis, {
    adjustment: 'none',
    anchor: null,
    quantityBasis: 'actual-units',
    volumeBasis: 'original',
    dividendMeaning: 'explicit-cash',
    dividendEvidenceRef: null,
    conversionAvailable: false,
    conversionEvidenceRef: null,
  });
  for (const segment of runConfig.executionModel!.segments) {
    if (segment.execution.mode === 'exchange') delete segment.execution.normalizedExecution;
  }
  const input = {
    strategy,
    runConfig,
    eventRevisions,
    plan: planBacktestDependencies({ strategy, runConfig }),
  };
  const request = expectedSnapshotDependencyRequestsV3(input).find(
    (r) => r.purpose === 'corporateActions',
  );
  if (request?.purpose !== 'corporateActions') throw new Error('缺少公司行动测试依赖');
  const events = snapshotEventDsaFixture();
  const policy = await events.effectiveControlPolicyV3();
  policy.projection.effective.routes = [];
  events.effectiveControlPolicyV3.mockResolvedValue(policy);
  const page: MarketAnnouncements = {
    providerId: 'official-states',
    page: 1,
    pageSize: 100,
    total: 0,
    items: [],
  };
  const get = vi.fn().mockResolvedValue(page);
  const collect = () => collectSnapshotEventsV3(input, request, events as never, { get });
  const announcement: MarketAnnouncement = {
    id: 'notice',
    title: '董事会换届公告',
    symbol: request.request.symbol,
    url: 'https://www.sse.com.cn/notice.pdf',
    publishedDate: request.range.start,
    uses: [],
    downloadState: 'pending',
    parseState: 'unparsed',
  };
  return { collect, input, request, page, get, events, announcement };
}

describe('原始份额研究回测的公告推定', () => {
  it('无关公告可以冻结重放；更换证券或篡改页数不能重放', async () => {
    const h = await fixture();
    h.get.mockResolvedValue({ ...h.page, total: 1, items: [h.announcement] });
    const result = await h.collect();
    expect(result.response).toMatchObject({
      provider: 'announcement-research-assumption',
      facts: [],
    });
    const bundle = JSON.parse(String(result.evidence.response));
    expect(validateSnapshotEventsV3(h.input, h.request, bundle)).toEqual(result);
    expect(() =>
      validateSnapshotEventsV3(h.input, h.request, { ...bundle, symbol: '000001.SZ' }),
    ).toThrow();
    bundle.pages[0].total++;
    expect(() => validateSnapshotEventsV3(h.input, h.request, bundle)).toThrow();
  });

  it('较早披露且出现在第二页的分红公告仍须核实', async () => {
    const h = await fixture();
    h.get
      .mockResolvedValueOnce({
        ...h.page,
        total: 101,
        items: Array.from({ length: 100 }, (_, i) => ({ ...h.announcement, id: String(i) })),
      })
      .mockResolvedValueOnce({
        ...h.page,
        page: 2,
        total: 101,
        items: [{ ...h.announcement, title: '权益分派实施公告', publishedDate: '2020-06-01' }],
      });
    await expect(h.collect()).rejects.toMatchObject({ reason: 'action_announcement_found' });
    expect(h.get).toHaveBeenCalledTimes(2);
  });

  it('公告查询失败和事件控制面错误均不产生空事件', async () => {
    const h = await fixture();
    h.get.mockRejectedValueOnce(new Error('offline'));
    await expect(h.collect()).rejects.toThrow('offline');
    h.events.effectiveControlPolicyV3.mockRejectedValueOnce(new Error('offline'));
    await expect(h.collect()).rejects.toMatchObject({ reason: 'event_plan_blocked' });
    expect(h.get).toHaveBeenCalledTimes(1);
  });

  it('已有事件来源优先；严格历史运行不进入研究推定', async () => {
    const h = await fixture();
    const source = snapshotEventDsaFixture();
    await expect(
      collectSnapshotEventsV3(h.input, h.request, source as never, { get: h.get }),
    ).resolves.toMatchObject({ response: { provider: 'event-v3-composite' } });
    h.input.runConfig.executionPriceProtocol.history = {
      basis: 'point-in-time',
      reconstructionEvidenceRef: 'pit',
    };
    await expect(h.collect()).rejects.toMatchObject({ reason: 'event_plan_blocked' });
    expect(h.get).not.toHaveBeenCalled();
  });
});

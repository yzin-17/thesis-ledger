import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { journalAnalyze, journalAnalyzePeriod } from '@thesis-ledger/domain';
import { browserJournalCandidate } from './browser-journal-candidate.fixture.js';
import { journalUiEvidenceFixture } from './journal-review.fixture.js';
import {
  browserJournalFailure,
  journalBrowserStateFixture,
} from './browser-journal-state.fixture.js';
import {
  browserJournalCandidateForObject,
  browserJournalCandidatePage,
  browserJournalHoldCandidateResponse,
  browserJournalReleaseCandidateResponses,
  browserJournalScenarioCandidates,
} from './browser-journal-scenario.fixture.js';

const candidate = () => browserJournalCandidate(journalUiEvidenceFixture());
const url = (query = '') => new URL(`http://fixture.invalid/journal/review-candidates${query}`);
const window = { start: '2026-01-01T00:00:00Z', end: '2026-01-04T00:00:00Z' };
describe('浏览器复盘验收固定场景', () => {
  beforeEach(() => {
    journalBrowserStateFixture.state = 'ready';
  });
  afterEach(() => {
    browserJournalReleaseCandidateResponses();
  });

  it('明确关联计划用于偏差分析，草稿不覆盖原计划', () => {
    journalBrowserStateFixture.state = 'planned';
    const current = candidate();
    expect(journalAnalyze(current).metrics.exitPriceDeviation!.value).toBe('-1');
    current.input.analysisDraft = { plannedExit: '14' };
    expect(journalAnalyze(current).metrics.exitPriceDeviation!.value).toBe('-2');
    expect(current.input.plan!.plannedExit).toBe('13');
  });
  it.each([
    ['cost-missing', 'EVIDENCE_INCOMPLETE'],
    ['fx-missing', 'FX_MISSING'],
    ['cost-conflict', 'COST_CONFLICT'],
  ] as const)('%s 在正式契约和分析中保留缺失原因，不伪造收益', (state, reason) => {
    journalBrowserStateFixture.state = state;
    const current = candidate();
    expect(current.statisticsEligibility.reasons).toContain(reason);
    expect(current.input.trade.netRealizedPnl).toBeNull();
    const result = journalAnalyze(current);
    expect(result.metrics.netRealizedPnl!.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.metrics.netRealizedPnl!.value).toBeNull();
    expect(journalAnalyzePeriod([current], window).tradeCycles.includedObjectIds).toEqual([]);
  });

  it('混合样本以周期和减仓身份独立计数和定位，不复制周期收益到减仓', () => {
    journalBrowserStateFixture.state = 'period-mixed';
    const candidates = browserJournalScenarioCandidates(candidate());
    const result = journalAnalyzePeriod(candidates, window);
    expect(result.tradeCycles.includedObjectIds).toEqual(['TRADE_CYCLE:trade-1']);
    expect(result.closeSlices.includedObjectIds).toEqual(['CLOSE_SLICE:slice-1']);
    expect(result.tradeCycles.metrics.netRealizedPnl.value).toBe('4');
    expect(result.closeSlices.metrics.netRealizedPnl.value).toBe('2');
    expect(candidates[1]!.effectiveClosedAt).toBeNull();
    expect(candidates[1]!.executedAt).toBe('2026-01-02T09:00:00Z');
  });
  it('空周期返回空样本；两类收益均不适用', () => {
    journalBrowserStateFixture.state = 'period-empty';
    const candidates = browserJournalScenarioCandidates(candidate());
    const result = journalAnalyzePeriod(candidates, window);
    expect(candidates).toEqual([]);
    expect(result.tradeCycles.metrics.netRealizedPnl.status).toBe('NOT_APPLICABLE');
    expect(result.closeSlices.metrics.netRealizedPnl.status).toBe('NOT_APPLICABLE');
  });
  it('混合场景切换到失败状态后，已选减仓仍按对象 ID 读取，保留账户模式', () => {
    journalBrowserStateFixture.state = 'period-error';
    const current = candidate();
    current.input.trade.accountMode = 'shadow';
    const slice = browserJournalCandidateForObject(current, 'CLOSE_SLICE:slice-1');
    expect(slice.input.reference.reviewObjectType).toBe('CLOSE_SLICE');
    expect(slice.input.trade.accountMode).toBe('shadow');
    expect(slice.executedAt).toBe('2026-01-02T09:00:00Z');
    expect(current.input.reference.reviewObjectType).toBe('TRADE_CYCLE');
  });
  it('两页分别提供完整周期和减仓，读取下一页后不重复第一页', () => {
    journalBrowserStateFixture.state = 'paged';
    const candidates = browserJournalScenarioCandidates(candidate());
    const first = browserJournalCandidatePage(url(), candidates);
    if (first instanceof Response) throw new Error('第一页不应失败');
    expect(first.items.map((row) => row.input.reference.reviewObjectId)).toEqual([
      'TRADE_CYCLE:trade-1',
    ]);
    expect(first.total).toBe(2);
    expect(first.nextCursor).not.toBeNull();
    const second = browserJournalCandidatePage(url(`?cursor=${first.nextCursor}`), candidates);
    if (second instanceof Response) throw new Error('第二页不应失败');
    expect(second.items.map((row) => row.input.reference.reviewObjectId)).toEqual([
      'CLOSE_SLICE:slice-1',
    ]);
    expect(second.nextCursor).toBeNull();
  });
  it.each([
    ['stale-cursor', 'JOURNAL_CURSOR_INVALID'],
    ['generation-conflict', 'PROJECTION_GENERATION_CONFLICT'],
  ] as const)('仅第二页注入 %s，第一页重读仍成功', async (state, errorCode) => {
    journalBrowserStateFixture.state = state;
    const candidates = browserJournalScenarioCandidates(candidate());
    const conflict = browserJournalCandidatePage(url('?cursor=old'), candidates);
    expect(conflict).toBeInstanceOf(Response);
    if (!(conflict instanceof Response)) throw new Error('缺少冲突响应');
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ errorCode });
    expect(browserJournalCandidatePage(url(), candidates)).not.toBeInstanceOf(Response);
  });
  it('候选窗口按对象执行/结束时间使用半开区间，标的筛选和 ACTIVE 可见性保留', () => {
    journalBrowserStateFixture.state = 'period-mixed';
    const candidates = browserJournalScenarioCandidates(candidate());
    const page = browserJournalCandidatePage(
      url('?start=2026-01-02T09:00:00Z&end=2026-01-03T09:00:00Z'),
      candidates,
    );
    if (page instanceof Response) throw new Error('窗口不应失败');
    expect(page.items.map((row) => row.input.reference.reviewObjectId)).toEqual([
      'CLOSE_SLICE:slice-1',
    ]);
    const other = browserJournalCandidatePage(url('?symbol=MSFT.US'), candidates);
    if (other instanceof Response) throw new Error('筛选不应失败');
    expect(other.items).toEqual([]);
    journalBrowserStateFixture.state = 'active';
    const active = browserJournalCandidatePage(
      url(),
      browserJournalScenarioCandidates(candidate()),
    );
    if (active instanceof Response) throw new Error('ACTIVE 不应失败');
    expect(active.items).toHaveLength(1);
    expect(active.items[0]!.statisticsEligibility.eligible).toBe(false);
  });
  it('周期失败只拒绝周期 POST，保留候选、单笔及历史读取', async () => {
    journalBrowserStateFixture.state = 'period-error';
    const response = browserJournalFailure(new URL('/journal/analysis/period', url()), 'POST');
    expect(response?.status).toBe(503);
    expect(await response?.json()).toMatchObject({ errorCode: 'FIXTURE_ERROR' });
    expect(browserJournalFailure(url(), undefined)).toBeNull();
    expect(browserJournalFailure(new URL('/journal/analysis/object', url()), 'POST')).toBeNull();
    expect(
      browserJournalFailure(new URL('/journal/review-snapshots', url()), undefined),
    ).toBeNull();
  });
  it('候选响应保持调用时内容，切换状态后仅显式释放才返回旧响应', async () => {
    journalBrowserStateFixture.state = 'delayed-response';
    const original = new Response(JSON.stringify({ accountId: 'old-account' }));
    let completed = false;
    const pending = browserJournalHoldCandidateResponse(original).then((response) => {
      completed = true;
      return response;
    });
    await Promise.resolve();
    expect(completed).toBe(false);
    journalBrowserStateFixture.state = 'ready';
    expect(await browserJournalHoldCandidateResponse(new Response('current'))).toBeInstanceOf(
      Response,
    );
    expect(completed).toBe(false);
    expect(browserJournalReleaseCandidateResponses()).toBe(1);
    expect(await (await pending).json()).toEqual({ accountId: 'old-account' });
    expect(browserJournalReleaseCandidateResponses()).toBe(0);
  });
});

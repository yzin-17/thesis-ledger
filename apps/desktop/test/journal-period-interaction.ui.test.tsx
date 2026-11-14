// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { journalAnalyzePeriod } from '@thesis-ledger/domain';
import { JournalPeriodReview } from '../src/features/journal/review/JournalPeriodReview.js';
import { notifyManager } from '@tanstack/react-query';
import type { getDesktopApiClient } from '../src/shared/api/client';
import type { JournalPeriodAiExplanation } from '@thesis-ledger/schemas';
import {
  journalButton,
  journalDeferred,
  journalClick,
  journalFill,
  journalMountedCandidate,
  journalWait,
  mountJournal,
} from './journal-mounted-harness.js';

type JournalApi = ReturnType<typeof getDesktopApiClient>['journalReviews'];
const api = vi.hoisted(() => ({
  period: vi.fn<JournalApi['period']>(),
  explainPeriod: vi.fn<JournalApi['explainPeriod']>(),
  periodExplanation: vi.fn<JournalApi['periodExplanation']>(),
}));
vi.mock('../src/shared/api/client', () => ({
  getDesktopApiClient: () => ({ journalReviews: api }),
}));
const props = {
  accountId: '00000000-0000-4000-8000-000000000001',
  mode: 'actual' as const,
  onSelect: vi.fn(),
};
const window = { start: '2026-01-02T09:00:00.000Z', end: '2026-01-04T00:00:00.000Z' };
const period = () => {
  const cycle = journalMountedCandidate();
  const slice = structuredClone(cycle);
  slice.input.reference = {
    reviewObjectType: 'CLOSE_SLICE',
    reviewObjectId: 'CLOSE_SLICE:slice-1',
    tradeId: 'trade-1',
    closeSliceId: 'slice-1',
  };
  return {
    accountId: props.accountId,
    mode: props.mode,
    symbol: null,
    ledgerRevision: '12',
    projectionGeneration: '7',
    candidates: [cycle, slice],
    result: journalAnalyzePeriod([cycle, slice], window),
  };
};
async function choosePreset(label: string) {
  await act(async () => document.querySelector<HTMLElement>('[aria-label="统计周期"]')!.click());
  await journalWait(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull());
  const option = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find((row) =>
    row.textContent?.includes(label),
  )!;
  await act(async () => {
    option.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    option.click();
  });
}
describe('周期复盘交互', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notifyManager.setNotifyFunction((callback) => {
      act(callback);
    });
    sessionStorage.clear();
    vi.stubGlobal('crypto', webcrypto);
    api.period.mockResolvedValue(period());
  });
  afterEach(() => {
    notifyManager.setNotifyFunction((callback) => callback());
  });
  const analyze = async () => {
    const view = await mountJournal(<JournalPeriodReview {...props} />);
    await choosePreset('自定义窗口');
    await journalFill('周期开始时间', window.start);
    await journalFill('周期结束时间', window.end);
    await journalClick('分析周期');
    await journalWait(() =>
      expect(view.host.querySelector('table[aria-label="两种统计粒度对照"]')).not.toBeNull(),
    );
    return view;
  };
  it('自定义窗口请求准确，周期与减仓各自统计并可定位对象', async () => {
    const view = await analyze();
    expect(api.period.mock.calls[0]![0]).toEqual({
      accountId: props.accountId,
      mode: props.mode,
      ...window,
    });
    expect(view.host.querySelector('thead')?.textContent).toBe('指标完整交易周期单次减仓');
    expect(view.host.textContent).toContain('自定义窗口');
    expect(view.host.textContent).not.toContain('本次结果窗口');
    expect(view.host.querySelectorAll('[data-slot="separator"]').length).toBeGreaterThanOrEqual(2);
    expect(view.host.querySelectorAll('table')).toHaveLength(1);
    const samples = [...view.host.querySelectorAll('details')].find(
      (item) => item.querySelector('summary')?.textContent === '单次减仓 · 样本与排除原因',
    )!;
    await act(async () => samples.querySelector('summary')!.click());
    expect(samples.open).toBe(true);
    await journalClick('CLOSE_SLICE:slice-1');
    expect(props.onSelect).toHaveBeenCalledWith('CLOSE_SLICE:slice-1');
  });
  it('窗口变化与新请求失败保留旧结果，并禁止旧窗口 AI', async () => {
    const view = await analyze();
    await journalFill('周期结束时间', '2026-01-05T00:00:00.000Z');
    expect(view.host.textContent).toContain('筛选条件已修改');
    expect(journalButton('AI 解读').disabled).toBe(true);
    await journalClick('AI 解读');
    expect(api.explainPeriod).not.toHaveBeenCalled();
    expect(document.querySelector('[data-slot=sheet-content]')).toBeNull();
    api.period.mockRejectedValueOnce(new Error('服务读取失败'));
    await journalClick('分析周期');
    await journalWait(() => expect(view.host.textContent).toContain('周期分析未完成'));
    expect(view.host.querySelector('table[aria-label="两种统计粒度对照"]')).not.toBeNull();
    expect(view.host.textContent).toContain('以下仍为上次分析结果');
    expect(api.explainPeriod).not.toHaveBeenCalled();
  });
  it('无效窗口不会发出请求；账户/模式重新挂载清除旧统计', async () => {
    const view = await analyze();
    await journalFill('周期开始时间', '无效时间');
    await journalClick('分析周期');
    await journalWait(() => expect(view.host.textContent).toContain('周期分析未完成'));
    expect(api.period).toHaveBeenCalledTimes(1);
    expect(view.host.querySelector('table[aria-label="两种统计粒度对照"]')).not.toBeNull();
    await view.render(<JournalPeriodReview key="other" {...props} mode="shadow" />);
    expect(view.host.querySelector('table[aria-label="两种统计粒度对照"]')).toBeNull();
  });
  it('默认 7 天与 30 天选项复用中文标签，发送对应的显式时间窗口', async () => {
    api.period.mockImplementation((request) =>
      Promise.resolve({
        ...period(),
        result: journalAnalyzePeriod([], request),
      }),
    );
    const view = await mountJournal(<JournalPeriodReview {...props} />);
    expect(view.host.textContent).toContain('最近 7 天');
    expect(view.host.textContent).not.toContain('复盘标的');
    expect(view.host.querySelector('[aria-label="周期复盘标的"]')).toBeNull();
    await journalClick('分析周期');
    await journalWait(() => expect(api.period).toHaveBeenCalledTimes(1));
    const first = api.period.mock.calls[0]![0];
    expect(Date.parse(first.end) - Date.parse(first.start)).toBe(7 * 86400000);
    await journalWait(() => expect(journalButton('分析周期').disabled).toBe(false));
    expect(document.querySelector('[aria-label="周期开始时间"]')).toBeNull();
    await choosePreset('最近 30 天');
    expect(view.host.textContent).toContain('最近 30 天');
    await journalClick('分析周期');
    await journalWait(() => expect(api.period).toHaveBeenCalledTimes(2));
    const second = api.period.mock.calls[1]![0];
    expect(Date.parse(second.end) - Date.parse(second.start)).toBe(30 * 86400000);
    expect(second).toMatchObject({ accountId: props.accountId, mode: 'actual' });
  });
  it('周期 AI 当前失败结果保留统计并显示在页面中，可按所属账户读取', async () => {
    const run = failedPeriodRun();
    api.explainPeriod.mockResolvedValue(run);
    api.periodExplanation.mockResolvedValue(run);
    const view = await analyze();
    expect(view.host.querySelector('section[aria-label="本次周期 AI 解读"]')).not.toBeNull();
    expect(api.periodExplanation).not.toHaveBeenCalled();
    await journalClick('AI 解读');
    await journalWait(() => expect(view.host.textContent).toContain(run.errorSummary));
    expect(document.querySelector('[data-slot=sheet-content]')).toBeNull();
    expect(view.host.querySelector('table[aria-label="两种统计粒度对照"]')).not.toBeNull();
    expect(api.periodExplanation).toHaveBeenCalledWith(
      run.id,
      { accountId: props.accountId, mode: props.mode },
      expect.anything(),
    );
    expect(api.explainPeriod).toHaveBeenCalledOnce();
  });
  it('重新分析期间晚到的旧 AI 创建结果不会回填新一轮分析', async () => {
    const pending = journalDeferred<JournalPeriodAiExplanation>();
    api.explainPeriod.mockReturnValue(pending.promise);
    const view = await analyze();
    await journalClick('AI 解读');
    await journalWait(() => expect(api.explainPeriod).toHaveBeenCalledOnce());
    await journalClick('分析周期');
    await journalWait(() => expect(api.period).toHaveBeenCalledTimes(2));
    await act(async () => pending.resolve(failedPeriodRun()));
    await journalWait(() => expect(view.host.textContent).toContain('尚未生成 AI 解读'));
    expect(api.periodExplanation).not.toHaveBeenCalled();
    expect(view.host.textContent).not.toContain('研究任务租约过期');
  });
  it('空窗口在同表显示两个零样本，简明说明不可计算指标', async () => {
    api.period.mockResolvedValue({
      ...period(),
      candidates: [],
      result: journalAnalyzePeriod([], window),
    });
    const view = await analyze();
    expect(view.host.querySelector('thead')?.textContent).toBe('指标完整交易周期单次减仓');
    expect(view.host.querySelector('tbody tr')?.textContent).toBe('合格样本数00');
    expect(view.host.querySelector('table')?.textContent).not.toContain('胜率');
    expect(view.host.textContent).toContain(
      '两种粒度均无合格样本，无法计算胜率、盈亏比和平均持有天数',
    );
    expect(api.explainPeriod).not.toHaveBeenCalled();
  });
});

function failedPeriodRun(): JournalPeriodAiExplanation {
  const data = period();
  return {
    id: '00000000-0000-4000-8000-000000000096',
    accountId: props.accountId,
    mode: props.mode,
    symbol: null,
    start: window.start,
    end: window.end,
    ledgerRevision: data.ledgerRevision,
    projectionGeneration: data.projectionGeneration,
    objectFingerprints: Object.fromEntries(
      data.candidates.map((row) => [
        row.input.reference.reviewObjectId,
        row.input.projection.evidenceFingerprint,
      ]),
    ),
    algorithmVersion: data.result.algorithmVersion,
    provider: 'fixture',
    model: 'fixture',
    promptVersion: 'fixture',
    status: 'failed',
    errorCode: 'fixture',
    errorSummary: '研究任务租约过期且发送结果未知；禁止自动重放 Provider',
    result: null,
    createdAt: '2026-11-14T00:00:00Z',
  };
}

// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { journalAnalyzePeriod } from '@thesis-ledger/domain';
import { JournalPeriodReview } from '../src/features/journal/review/JournalPeriodReview.js';
import {
  journalButton,
  journalClick,
  journalFill,
  journalMountedCandidate,
  journalWait,
  mountJournal,
} from './journal-mounted-harness.js';

const api = vi.hoisted(() => ({
  period: vi.fn(),
  explainPeriod: vi.fn(),
  periodExplanation: vi.fn(),
}));
vi.mock('../src/shared/api/client', () => ({
  getDesktopApiClient: () => ({ journalReviews: api }),
}));
const props = {
  accountId: '00000000-0000-4000-8000-000000000001',
  mode: 'actual' as const,
  symbol: '',
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
describe('周期复盘交互', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.stubGlobal('crypto', webcrypto);
    api.period.mockResolvedValue(period());
  });
  const analyze = async () => {
    const view = await mountJournal(<JournalPeriodReview {...props} />);
    await journalFill('周期开始时间', window.start);
    await journalFill('周期结束时间', window.end);
    await journalClick('分析周期');
    await journalWait(() => expect(view.host.textContent).toContain('完整交易周期统计'));
    return view;
  };
  it('自定义窗口请求准确，周期与减仓各自统计并可定位对象', async () => {
    const view = await analyze();
    expect(api.period.mock.calls[0]![0]).toEqual({
      accountId: props.accountId,
      mode: props.mode,
      ...window,
    });
    expect(view.host.textContent).toContain('单次减仓统计');
    expect(view.host.textContent).toContain('自定义窗口');
    expect(view.host.textContent).toContain(
      '本次结果窗口：[2026-01-02T09:00:00.000Z, 2026-01-04T00:00:00.000Z)',
    );
    await journalClick('CLOSE_SLICE:slice-1');
    expect(props.onSelect).toHaveBeenCalledWith('CLOSE_SLICE:slice-1');
  });
  it('窗口变化与新请求失败保留旧结果，并禁止旧窗口 AI', async () => {
    const view = await analyze();
    await journalFill('周期结束时间', '2026-01-05T00:00:00.000Z');
    expect(view.host.textContent).toContain('窗口已修改');
    await journalWait(() => expect(journalButton('开始 AI 解读').disabled).toBe(true));
    api.period.mockRejectedValueOnce(new Error('服务读取失败'));
    await journalClick('分析周期');
    await journalWait(() => expect(view.host.textContent).toContain('周期分析未完成'));
    expect(view.host.textContent).toContain('完整交易周期统计');
    expect(view.host.textContent).toContain(window.end);
    expect(api.explainPeriod).not.toHaveBeenCalled();
  });
  it('无效窗口不会发出请求；账户/模式重新挂载清除旧统计', async () => {
    const view = await analyze();
    await journalFill('周期开始时间', '无效时间');
    await journalClick('分析周期');
    await journalWait(() => expect(view.host.textContent).toContain('周期分析未完成'));
    expect(api.period).toHaveBeenCalledTimes(1);
    expect(view.host.textContent).toContain('完整交易周期统计');
    await view.render(<JournalPeriodReview key="other" {...props} mode="shadow" />);
    expect(view.host.textContent).not.toContain('完整交易周期统计');
  });
  it('默认 7 天与 30 天选项复用中文标签，发送对应的显式时间窗口', async () => {
    api.period.mockImplementation(async (request) => ({
      ...period(),
      result: journalAnalyzePeriod([], request),
    }));
    const view = await mountJournal(<JournalPeriodReview {...props} />);
    expect(view.host.textContent).toContain('最近 7 天');
    await journalClick('分析周期');
    await journalWait(() => expect(api.period).toHaveBeenCalledTimes(1));
    const first = api.period.mock.calls[0]![0];
    expect(Date.parse(first.end) - Date.parse(first.start)).toBe(7 * 86400000);
    await journalWait(() => expect(journalButton('分析周期').disabled).toBe(false));
    await act(async () => document.querySelector<HTMLElement>('[aria-label="统计窗口"]')!.click());
    await journalWait(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull());
    const option = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find(
      (row) => row.textContent?.includes('最近 30 天'),
    )!;
    await act(async () => {
      option.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
      option.click();
    });
    expect(view.host.textContent).toContain('最近 30 天');
    await journalClick('分析周期');
    await journalWait(() => expect(api.period).toHaveBeenCalledTimes(2));
    const second = api.period.mock.calls[1]![0];
    expect(Date.parse(second.end) - Date.parse(second.start)).toBe(30 * 86400000);
    expect(second).toMatchObject({ accountId: props.accountId, mode: 'actual' });
  });
  it('空窗口分别显示两个零样本组，收益与胜率不伪造为零', async () => {
    api.period.mockResolvedValue({
      ...period(),
      candidates: [],
      result: journalAnalyzePeriod([], window),
    });
    const view = await analyze();
    expect(view.host.textContent).toContain('完整交易周期统计');
    expect(view.host.textContent).toContain('单次减仓统计');
    const descriptions = Array.from(
      view.host.querySelectorAll('[data-slot="card-description"]'),
    ).filter((row) => row.textContent?.includes('窗口内 0 个对象'));
    expect(descriptions).toHaveLength(2);
    expect(view.host.textContent).toContain('不适用');
    expect(api.explainPeriod).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { journalAnalyze } from '@thesis-ledger/domain';
import { JournalObjectReview } from '../src/features/journal/review/JournalObjectReview.js';
import {
  journalButton,
  journalClick,
  journalDeferred,
  journalFill,
  journalMountedCandidate,
  journalWait,
  mountJournal,
} from './journal-mounted-harness.js';

const api = vi.hoisted(() => ({
  object: vi.fn(),
  analyze: vi.fn(),
  save: vi.fn(),
  explain: vi.fn(),
  explanation: vi.fn(),
}));
vi.mock('../src/shared/api/client', () => ({
  getDesktopApiClient: () => ({ journalReviews: api }),
}));
const candidate = journalMountedCandidate;
const props = {
  accountId: '00000000-0000-4000-8000-000000000001',
  mode: 'actual' as const,
  reviewObjectId: 'TRADE_CYCLE:trade-1',
  onHistory: vi.fn(),
};

describe('单笔复盘交互', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.stubGlobal('crypto', webcrypto);
    api.object.mockResolvedValue(candidate());
    api.analyze.mockImplementation(async (request) => {
      const row = candidate();
      row.input.analysisDraft = request.analysisDraft;
      return { candidate: row, result: journalAnalyze(row) };
    });
    api.save.mockResolvedValue({});
  });
  const mount = async () => {
    const view = await mountJournal(<JournalObjectReview {...props} />);
    await journalWait(() => expect(view.host.textContent).toContain('真实退出成交'));
    return view;
  };
  it('读取失败只有局部错误，重试后读取事实，未分析不能保存或触发 AI', async () => {
    api.object.mockRejectedValueOnce(new Error('服务暂不可用'));
    const view = await mountJournal(<JournalObjectReview {...props} />);
    await journalWait(() => expect(view.host.textContent).toContain('对象读取失败'));
    expect(view.host.textContent).not.toContain('确定性复盘结果');
    await journalClick('重新读取');
    await journalWait(() => expect(view.host.textContent).toContain('真实退出成交'));
    expect(journalButton('保存复盘快照').disabled).toBe(true);
    expect(api.explain).not.toHaveBeenCalled();
  });
  it('草稿取消不应用；显式应用进入本次输入，原计划与事实保持原样', async () => {
    const source = candidate();
    api.object.mockResolvedValue(source);
    const before = JSON.stringify(source);
    await mount();
    await journalClick('核对与补充本次草稿');
    await journalWait(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    await journalFill('计划退出价', '13');
    await journalClick('取消');
    await journalClick('开始复盘');
    await journalWait(() => expect(api.analyze).toHaveBeenCalledTimes(1));
    expect(api.analyze.mock.calls[0]![0].analysisDraft).toEqual({});
    await journalWait(() => expect(journalButton('保存复盘快照').disabled).toBe(false));
    await journalClick('核对与补充本次草稿');
    await journalFill('计划退出价', '13');
    await journalClick('应用草稿');
    expect(document.body.textContent).toContain('需要重新分析');
    expect(journalButton('保存复盘快照').disabled).toBe(true);
    await journalClick('开始复盘');
    await journalWait(() => expect(api.analyze).toHaveBeenCalledTimes(2));
    expect(api.analyze.mock.calls[1]![0].analysisDraft).toEqual({ plannedExit: '13' });
    expect(JSON.stringify(source)).toBe(before);
    expect(api.save).not.toHaveBeenCalled();
  });
  it('保存失败与 AI 提交失败均保留确定性结果，保存重试不会自动调用 AI', async () => {
    const view = await mount();
    await journalClick('开始复盘');
    await journalWait(() => expect(journalButton('保存复盘快照').disabled).toBe(false));
    api.save.mockRejectedValueOnce(new Error('保存失败'));
    await journalClick('保存复盘快照');
    await journalWait(() => expect(view.host.textContent).toContain('快照未保存'));
    expect(view.host.textContent).toContain('确定性复盘结果');
    api.explain.mockRejectedValueOnce(new Error('默认模型不可用'));
    await journalWait(() => expect(journalButton('开始 AI 解读').disabled).toBe(false));
    await journalClick('开始 AI 解读');
    await journalWait(() => expect(view.host.textContent).toContain('AI 解读未提交'));
    expect(view.host.textContent).toContain('确定性复盘结果');
    await journalClick('保存复盘快照');
    await journalWait(() => expect(view.host.textContent).toContain('复盘快照已保存'));
    expect(api.save).toHaveBeenCalledTimes(2);
    expect(api.explain).toHaveBeenCalledTimes(1);
    expect(api.save.mock.calls[1]![0]).not.toHaveProperty('aiRunId');
  });
  it('再次分析失败时仍保留上次计算结果', async () => {
    const view = await mount();
    await journalClick('开始复盘');
    await journalWait(() => expect(view.host.textContent).toContain('确定性复盘结果'));
    api.analyze.mockRejectedValueOnce(new Error('证据读取失败'));
    await journalClick('开始复盘');
    await journalWait(() => expect(view.host.textContent).toContain('分析未完成'));
    expect(view.host.textContent).toContain('确定性复盘结果');
  });
  it('当前事实变化后旧结果保留，但保存与 AI 均要求重新分析', async () => {
    const view = await mount();
    await journalClick('开始复盘');
    await journalWait(() => expect(journalButton('保存复盘快照').disabled).toBe(false));
    const changed = candidate();
    changed.input.projection.evidenceFingerprint = 'facts-new';
    api.object.mockResolvedValueOnce(changed);
    await act(async () => {
      await view.client.refetchQueries({ queryKey: ['journal-review-object'] });
    });
    await journalWait(() => expect(view.host.textContent).toContain('当前事实已变化'));
    expect(view.host.textContent).toContain('确定性复盘结果');
    expect(journalButton('保存复盘快照').disabled).toBe(true);
    await journalWait(() => expect(journalButton('开始 AI 解读').disabled).toBe(true));
  });
  it('切换账户或模式时清除旧结果，晚响应不能写入新面板', async () => {
    const view = await mount();
    const late = journalDeferred<{
      candidate: ReturnType<typeof candidate>;
      result: ReturnType<typeof journalAnalyze>;
    }>();
    api.analyze.mockReturnValueOnce(late.promise);
    await journalClick('开始复盘');
    const second = candidate();
    second.input.trade.symbol = 'MSFT.US';
    api.object.mockResolvedValueOnce(second);
    await view.render(
      <JournalObjectReview
        key="other:shadow"
        {...props}
        accountId="00000000-0000-4000-8000-000000000088"
        mode="shadow"
      />,
    );
    late.resolve({ candidate: candidate(), result: journalAnalyze(candidate()) });
    await journalWait(() => expect(view.host.textContent).toContain('MSFT.US'));
    expect(view.host.textContent).not.toContain('确定性复盘结果');
    expect(journalButton('保存复盘快照').disabled).toBe(true);
    expect(api.save).not.toHaveBeenCalled();
    expect(api.explain).not.toHaveBeenCalled();
  });
  it('草稿验证与键盘取消保持本次状态，标签点击不激活控件，关闭后归还焦点', async () => {
    await mount();
    const trigger = journalButton('核对与补充本次草稿');
    await act(async () => trigger.focus());
    await journalClick('核对与补充本次草稿');
    await journalWait(() =>
      expect(document.querySelector('[role="dialog"]')?.contains(document.activeElement)).toBe(
        true,
      ),
    );
    const stop = document.querySelector<HTMLInputElement>('input[aria-label="计划止损价"]')!;
    await act(async () => stop.focus());
    const label = Array.from(
      document.querySelectorAll<HTMLElement>('[data-slot="field-label"]'),
    ).find((row) => row.textContent === '计划退出价')!;
    await act(async () => label.click());
    expect(document.activeElement).toBe(stop);
    await journalFill('计划退出价', '不是价格');
    await journalClick('应用草稿');
    expect(document.body.textContent).toContain('草稿尚未应用');
    expect(api.analyze).not.toHaveBeenCalled();
    await act(async () =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }),
      ),
    );
    await journalWait(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    await journalWait(() => expect(document.activeElement).toBe(trigger));
    await journalClick('开始复盘');
    await journalWait(() => expect(api.analyze).toHaveBeenCalledTimes(1));
    expect(api.analyze.mock.calls[0]![0].analysisDraft).toEqual({});
  });
});

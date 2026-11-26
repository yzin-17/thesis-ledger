// @vitest-environment jsdom
import { journalExplanationResult } from './journal-ai-session.fixture.js';
import { createHash, webcrypto } from 'node:crypto';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { journalAnalyze } from '@thesis-ledger/domain';
import { JournalObjectReview } from '../src/features/journal/review/JournalObjectReview.js';
import type * as ToastModule from '../src/components/ui/toast.js';
import {
  journalButton,
  journalClick,
  journalDeferred,
  journalFill,
  journalMountedCandidate,
  journalWait,
  mountJournal,
} from './journal-mounted-harness.js';

const toast = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('@/components/ui/toast', async (importOriginal) => ({
  ...(await importOriginal<typeof ToastModule>()),
  useToastManager: () => toast,
}));
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
  const suiteScope = journalObjectInteractionContext();
  registerJournalSummaryCases(suiteScope);
  registerJournalAiSaveCases(suiteScope);
  registerJournalInputCases(suiteScope);
  registerJournalDraftAndRetryCases(suiteScope);
  registerJournalFailureCases(suiteScope);
  registerJournalSavedReadCases(suiteScope);
  registerJournalIsolationAndKeyboardCases(suiteScope);
});

function journalObjectInteractionContext() {
  let nextAiRun = 0;
  beforeEach(() => {
    vi.clearAllMocks();
    nextAiRun = 0;
    sessionStorage.clear();
    vi.stubGlobal('crypto', webcrypto);
    api.object.mockResolvedValue(candidate());
    api.analyze.mockImplementation(async (request) => {
      const row = candidate();
      row.input.analysisDraft = request.analysisDraft;
      return { candidate: row, result: journalAnalyze(row) };
    });
    api.save.mockResolvedValue({});
    api.explain.mockImplementation(async () => ({
      id: `00000000-0000-4000-8000-${String(++nextAiRun).padStart(12, '0')}`,
      provider: '验收 Provider',
      model: '验收模型',
      promptVersion: 'journal-review-v5',
      algorithmVersion: 'journal-decimal-1',
      status: 'queued',
      errorSummary: null,
      result: null,
    }));
    api.explanation.mockImplementation(async (id: string) => ({
      id,
      accountId: props.accountId,
      mode: props.mode,
      reviewObjectId: props.reviewObjectId,
      evidenceFingerprint: candidate().input.projection.evidenceFingerprint,
      analysisDraft: null,
      provider: '验收 Provider',
      model: '验收模型',
      promptVersion: 'journal-review-v5',
      algorithmVersion: 'journal-decimal-1',
      status: 'succeeded',
      errorSummary: null,
      result: journalExplanationResult('本轮 AI 生成结果'),
    }));
  });
  const mount = async () => {
    const view = await mountJournal(<JournalObjectReview {...props} />);
    await journalWait(() => expect(view.host.textContent).toContain('真实退出成交'));
    return view;
  };
  return {
    get nextAiRun() {
      return nextAiRun;
    },
    set nextAiRun(value: typeof nextAiRun) {
      nextAiRun = value;
    },
    get mount() {
      return mount;
    },
  };
}
function registerJournalSummaryCases(
  suiteScope: ReturnType<typeof journalObjectInteractionContext>,
) {
  it('主要操作位于摘要标题区，成交来源默认收起且可展开，返回不重建结果', async () => {
    const onReturnToCandidates = vi.fn();
    const view = await mountJournal(
      <JournalObjectReview {...props} onReturnToCandidates={onReturnToCandidates} />,
    );
    await journalWait(() => expect(view.host.textContent).toContain('成交与计划来源'));
    expect(journalButton('开始复盘').closest('[aria-label="复盘事实概览"]')).not.toBeNull();
    const source = [...view.host.querySelectorAll('details')].find(
      (row) => row.querySelector('summary')?.textContent === '成交与计划来源',
    )!;
    expect(source.open).toBe(false);
    await act(async () => source.querySelector('summary')!.click());
    expect(source.open).toBe(true);
    await journalClick('开始复盘');
    await journalWait(() => expect(journalButton('保存复盘快照').disabled).toBe(false));
    expect(view.host.querySelector('[aria-label="确定性复盘结果"] [data-slot="card"]')).toBeNull();
    expect(
      view.host.querySelector('[aria-label="计算口径与反事实假设"] [data-slot="alert"]'),
    ).toBeNull();
    expect(view.host.querySelector('[data-frame="plain"]')).not.toBeNull();
    await journalClick('返回对象列表');
    expect(onReturnToCandidates).toHaveBeenCalledOnce();
    expect(view.host.textContent).toContain('确定性复盘结果');
    expect(source.open).toBe(true);
    expect(api.analyze).toHaveBeenCalledTimes(1);
    expect(api.save).not.toHaveBeenCalled();
  });
  it('未保存的 AI 任务不绑定交易，重新点击开始复盘生成新任务', async () => {
    const oldId = '00000000-0000-4000-8000-000000000098';
    const legacyScope = JSON.stringify(['tasks', props.accountId, props.mode]);
    const key = `journal-review-ai:v1:${createHash('sha256').update(legacyScope).digest('hex')}`;
    sessionStorage.setItem(key, JSON.stringify([{ id: oldId, kind: 'object' }]));
    const view = await suiteScope.mount();
    expect(view.host.textContent).not.toContain('本轮 AI 生成结果');
    expect(view.host.textContent).not.toContain('已绑定的历史解读结论');
    expect(api.explanation).not.toHaveBeenCalled();
    expect(api.explain).not.toHaveBeenCalled();

    await journalClick('开始复盘');
    await journalWait(() => expect(view.host.textContent).toContain('本轮 AI 生成结果'));
    expect(api.explain).toHaveBeenCalledTimes(1);
    const firstId = '00000000-0000-4000-8000-000000000001';
    expect(api.explanation.mock.calls.at(-1)![0]).toBe(firstId);
    expect(api.save).not.toHaveBeenCalled();

    await journalClick('开始复盘');
    await journalWait(() => expect(api.explain).toHaveBeenCalledTimes(2));
    await journalWait(() =>
      expect(api.explanation.mock.calls.at(-1)![0]).toBe('00000000-0000-4000-8000-000000000002'),
    );
    expect(api.explanation.mock.calls.at(-1)![0]).not.toBe(firstId);
    expect(api.analyze).toHaveBeenCalledTimes(2);
    expect(api.save).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(key)).toContain(oldId);
    expect(sessionStorage.getItem(key)).not.toContain('00000000-0000-4000-8000-000000000002');

    await view.dispose();
    const reopened = await suiteScope.mount();
    expect(reopened.host.textContent).not.toContain('本轮 AI 生成结果');
    expect(api.explain).toHaveBeenCalledTimes(2);
    expect(api.explanation).toHaveBeenCalledTimes(2);
  });
}
function registerJournalAiSaveCases(
  suiteScope: ReturnType<typeof journalObjectInteractionContext>,
) {
  it('AI 请求尚未完成时不可提前保存快照', async () => {
    const queued = {
      id: '00000000-0000-4000-8000-000000000001',
      provider: '验收 Provider',
      model: '验收模型',
      promptVersion: 'journal-review-v5',
      algorithmVersion: 'journal-decimal-1',
      status: 'queued',
      errorSummary: null,
      result: null,
    };
    const delayed = journalDeferred<typeof queued>();
    api.explain.mockReturnValueOnce(delayed.promise);
    const view = await suiteScope.mount();
    await journalClick('开始复盘');
    await journalWait(() => expect(api.explain).toHaveBeenCalledOnce());
    expect(journalButton('保存复盘快照').disabled).toBe(true);
    expect(api.save).not.toHaveBeenCalled();
    await act(async () => delayed.resolve(queued));
    await journalWait(() => expect(view.host.textContent).toContain('本轮 AI 生成结果'));
    expect(journalButton('保存复盘快照').disabled).toBe(false);
  });
  it('保存快照只关联本轮成功的 AI 解读，而不是旧任务', async () => {
    const view = await suiteScope.mount();
    await journalClick('开始复盘');
    await journalWait(() => expect(view.host.textContent).toContain('本轮 AI 生成结果'));
    expect(api.save).not.toHaveBeenCalled();
    await journalClick('保存复盘快照');
    await journalWait(() => expect(api.save).toHaveBeenCalledTimes(1));
    expect(api.save.mock.calls[0]![0].aiRunId).toBe('00000000-0000-4000-8000-000000000001');
  });
}
function registerJournalInputCases(suiteScope: ReturnType<typeof journalObjectInteractionContext>) {
  it('无原计划时以双列表单补充，不重复显示未提供，也不出现第二层 Drawer', async () => {
    const row = candidate();
    row.input.plan = null;
    api.object.mockResolvedValue(row);
    const view = await suiteScope.mount();
    await journalClick('补充计划与假设');
    const editor = view.host.querySelector<HTMLElement>('[aria-label="本次分析草稿"]');
    expect(editor).not.toBeNull();
    expect(editor!.querySelector('[data-slot="field-group"]')?.className).toContain(
      'sm:grid-cols-2',
    );
    expect(editor!.querySelectorAll('input[placeholder="选填"]')).toHaveLength(4);
    expect(editor!.textContent).not.toContain('原计划：未提供');
    expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull();
    await journalClick('取消');
    expect(view.host.querySelector('[aria-label="本次分析草稿"]')).toBeNull();
    expect(view.host.textContent).toContain('开始复盘');
  });
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
}
function registerJournalDraftAndRetryCases(
  suiteScope: ReturnType<typeof journalObjectInteractionContext>,
) {
  it('草稿取消不应用；显式应用进入本次输入，原计划与事实保持原样', async () => {
    const source = candidate();
    api.object.mockResolvedValue(source);
    const before = JSON.stringify(source);
    const view = await suiteScope.mount();
    await journalClick('补充计划与假设');
    await journalWait(() =>
      expect(view.host.querySelector('[aria-label="本次分析草稿"]')).not.toBeNull(),
    );
    expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull();
    expect(
      view.host.querySelectorAll('[aria-label="本次分析草稿"] [data-slot="field"]'),
    ).toHaveLength(5);
    await journalFill('计划退出价', '13');
    await journalClick('取消');
    await journalWait(() => expect(document.querySelector('[role="alertdialog"]')).not.toBeNull());
    await journalClick('继续编辑');
    expect(document.querySelector<HTMLInputElement>('input[aria-label="计划退出价"]')!.value).toBe(
      '13',
    );
    await journalClick('取消');
    await journalClick('放弃修改并关闭');
    await journalClick('开始复盘');
    await journalWait(() => expect(api.analyze).toHaveBeenCalledTimes(1));
    expect(api.analyze.mock.calls[0]![0].analysisDraft).toEqual({});
    await journalWait(() => expect(journalButton('保存复盘快照').disabled).toBe(false));
    await journalClick('补充计划与假设');
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
  it('快照保存失败后重试不会重新调用 AI，成功才写入本轮任务引用', async () => {
    const view = await suiteScope.mount();
    api.save.mockRejectedValueOnce(new Error('保存失败'));
    await journalClick('开始复盘');
    await journalWait(() => expect(view.host.textContent).toContain('本轮 AI 生成结果'));
    await journalWait(() => expect(journalButton('保存复盘快照').disabled).toBe(false));
    await journalClick('保存复盘快照');
    await journalWait(() => expect(view.host.textContent).toContain('快照未保存'));
    expect(toast.add).not.toHaveBeenCalled();
    expect(view.host.textContent).toContain('确定性复盘结果');
    expect(api.explain).toHaveBeenCalledTimes(1);
    await journalClick('保存复盘快照');
    await journalWait(() =>
      expect(toast.add).toHaveBeenCalledWith({
        title: '复盘快照已保存',
        description: '原始事实、草稿与计算结果已保留，可在历史快照中读取。',
        type: 'success',
      }),
    );
    expect(toast.add).toHaveBeenCalledTimes(1);
    expect(view.host.textContent).not.toContain('复盘快照已保存');
    expect(api.save).toHaveBeenCalledTimes(2);
    expect(api.explain).toHaveBeenCalledTimes(1);
    expect(api.save.mock.calls[1]![0].aiRunId).toBe('00000000-0000-4000-8000-000000000001');
  });
}
function registerJournalFailureCases(
  suiteScope: ReturnType<typeof journalObjectInteractionContext>,
) {
  it('AI 生成失败仍可保存确定性快照，但不关联失败任务', async () => {
    api.explain.mockRejectedValueOnce(new Error('默认模型不可用'));
    const view = await suiteScope.mount();
    await journalClick('开始复盘');
    await journalWait(() => expect(view.host.textContent).toContain('AI 解读未提交'));
    expect(view.host.textContent).toContain('确定性复盘结果');
    await journalWait(() => expect(journalButton('保存复盘快照').disabled).toBe(false));
    await journalClick('保存复盘快照');
    await journalWait(() =>
      expect(toast.add).toHaveBeenCalledWith(
        expect.objectContaining({ title: '复盘快照已保存', type: 'success' }),
      ),
    );
    expect(view.host.textContent).not.toContain('复盘快照已保存');
    expect(api.save.mock.calls[0]![0]).not.toHaveProperty('aiRunId');
  });
  it('再次分析失败时仍保留上次计算结果', async () => {
    const view = await suiteScope.mount();
    await journalClick('开始复盘');
    await journalWait(() => expect(view.host.textContent).toContain('确定性复盘结果'));
    api.analyze.mockRejectedValueOnce(new Error('证据读取失败'));
    await journalClick('开始复盘');
    await journalWait(() => expect(view.host.textContent).toContain('分析未完成'));
    expect(view.host.textContent).toContain('确定性复盘结果');
  });
}
function registerJournalSavedReadCases(
  suiteScope: ReturnType<typeof journalObjectInteractionContext>,
) {
  it('快照已保存但对象重读失败仍保留成功和结果；只重读恢复，不重复写入', async () => {
    const view = await suiteScope.mount();
    await journalClick('开始复盘');
    await journalWait(() => expect(journalButton('保存复盘快照').disabled).toBe(false));
    api.object.mockRejectedValueOnce(new Error('保存后读取失败'));
    await journalClick('保存复盘快照');
    await journalWait(() => expect(view.host.textContent).toContain('当前对象暂未更新'));
    expect(toast.add).toHaveBeenCalledWith(
      expect.objectContaining({ title: '复盘快照已保存', type: 'success' }),
    );
    expect(view.host.textContent).not.toContain('复盘快照已保存');
    expect(view.host.textContent).toContain('确定性复盘结果');
    expect(journalButton('保存复盘快照').disabled).toBe(true);
    expect(journalButton('开始复盘').disabled).toBe(true);
    await journalClick('重新读取');
    await journalWait(() => expect(journalButton('开始复盘').disabled).toBe(false));
    expect(view.host.textContent).not.toContain('复盘快照已保存');
    expect(toast.add).toHaveBeenCalledTimes(1);
    expect(api.save).toHaveBeenCalledOnce();
    expect(api.analyze).toHaveBeenCalledOnce();
    expect(api.explain).toHaveBeenCalledTimes(1);
  });
  it('当前事实变化后旧结果保留，但保存与 AI 均要求重新分析', async () => {
    const view = await suiteScope.mount();
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
    expect(journalButton('保存复盘快照').disabled).toBe(true);
  });
}
function registerJournalIsolationAndKeyboardCases(
  suiteScope: ReturnType<typeof journalObjectInteractionContext>,
) {
  it('切换账户或模式时清除旧结果，晚响应不能写入新面板', async () => {
    const view = await suiteScope.mount();
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
    await suiteScope.mount();
    const trigger = journalButton('补充计划与假设');
    await act(async () => trigger.focus());
    await journalClick('补充计划与假设');
    await journalWait(() =>
      expect(
        document.querySelector('[aria-label="本次分析草稿"]')?.contains(document.activeElement),
      ).toBe(true),
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
    expect(document.body.textContent).toContain('计划退出价必须是大于零的有效十进制价格');
    expect(
      document.querySelector('input[aria-label="计划退出价"]')?.getAttribute('aria-invalid'),
    ).toBe('true');
    expect(api.analyze).not.toHaveBeenCalled();
    await act(async () =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }),
      ),
    );
    await journalWait(() => expect(document.querySelector('[role="alertdialog"]')).not.toBeNull());
    await journalClick('放弃修改并关闭');
    await journalWait(() =>
      expect(document.querySelector('[aria-label="本次分析草稿"]')).toBeNull(),
    );
    await journalWait(() => expect(document.activeElement).toBe(journalButton('补充计划与假设')));
    await journalClick('开始复盘');
    await journalWait(() => expect(api.analyze).toHaveBeenCalledTimes(1));
    expect(api.analyze.mock.calls[0]![0].analysisDraft).toEqual({});
  });
}

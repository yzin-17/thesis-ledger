// @vitest-environment jsdom
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JournalLegacyJsonReview } from '../src/features/journal/review/JournalLegacyJsonReview.js';
import {
  journalButton,
  journalClick,
  journalDeferred,
  journalWait,
  mountJournal,
} from './journal-mounted-harness.js';

const api = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../src/features/shared/request.js', () => ({
  requestDesktopJson: api.request,
}));

const input = JSON.stringify({
  symbol: 'SAMPLE.US',
  entryAt: '2026-01-01T00:00:00.000Z',
  exitAt: '2026-01-02T00:00:00.000Z',
  pnl: 1,
});

function legacyTextarea() {
  const textarea = document.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="旧交易 JSON"]',
  );
  expect(textarea).not.toBeNull();
  return textarea!;
}

async function fillLegacyTextarea(value: string) {
  const textarea = legacyTextarea();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      textarea,
      value,
    );
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('高级 JSON 兼容分析交互', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('请求 pending 时锁定输入、阻止重提和关闭，并把结果绑定到提交内容', async () => {
    const pending = journalDeferred<unknown>();
    const duplicate = journalDeferred<unknown>();
    api.request.mockReturnValueOnce(pending.promise).mockReturnValue(duplicate.promise);
    const view = await mountJournal(<JournalLegacyJsonReview />);
    journalButton('高级 JSON 兼容分析');
    await journalClick('高级 JSON 兼容分析');
    await journalWait(() => expect(legacyTextarea()).toBeDefined());
    await fillLegacyTextarea(input);
    await journalClick('分析兼容输入');
    await journalWait(() => expect(api.request).toHaveBeenCalledTimes(1));

    const textarea = legacyTextarea();
    const submit = journalButton('分析兼容输入');
    const changedInput = JSON.stringify({ ...JSON.parse(input), pnl: 2 });
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        textarea,
        changedInput,
      );
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await view.render(<JournalLegacyJsonReview />);
    const stateAfterEdit = {
      textareaDisabled: textarea.disabled,
      submitDisabled: submit.disabled,
    };

    await act(async () => submit.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const requestsAfterResubmit = api.request.mock.calls.length;
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    const remainsOpenWhilePending = textarea.isConnected;

    await act(async () => {
      pending.resolve({ result: 'submitted pnl 1' });
      duplicate.resolve({ result: 'duplicate request' });
      await Promise.all([pending.promise, duplicate.promise]);
    });
    expect(stateAfterEdit).toEqual({
      textareaDisabled: true,
      submitDisabled: true,
    });
    expect(requestsAfterResubmit).toBe(1);
    expect(remainsOpenWhilePending).toBe(true);
    expect(api.request).toHaveBeenCalledTimes(1);
    expect(api.request.mock.calls[0]![1].body).toBe(input);
    await journalWait(() => expect(document.body.textContent).toContain('submitted pnl 1'));
  });

  it('无效输入不发请求，失败保留内容并允许同内容重试和正常关闭', async () => {
    api.request
      .mockRejectedValueOnce(new Error('受控服务失败'))
      .mockResolvedValueOnce({ status: 'retry succeeded' });
    await mountJournal(<JournalLegacyJsonReview />);
    journalButton('高级 JSON 兼容分析');
    await journalClick('高级 JSON 兼容分析');
    await journalWait(() => expect(legacyTextarea()).toBeDefined());
    await fillLegacyTextarea('{');
    await journalClick('分析兼容输入');
    await journalWait(() => expect(document.body.textContent).toContain('请输入有效的旧交易 JSON'));
    expect(api.request).not.toHaveBeenCalled();

    await fillLegacyTextarea(input);
    await journalClick('分析兼容输入');
    await journalWait(() => expect(document.body.textContent).toContain('兼容输入未完成分析'));
    expect(legacyTextarea().value).toBe(input);
    expect(api.request).toHaveBeenCalledTimes(1);

    await journalClick('分析兼容输入');
    await journalWait(() => expect(document.body.textContent).toContain('retry succeeded'));
    expect(api.request).toHaveBeenCalledTimes(2);
    expect(api.request.mock.calls[1]![1].body).toBe(input);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await journalWait(() =>
      expect(document.querySelector('textarea[aria-label="旧交易 JSON"]')).toBeNull(),
    );
    expect(journalButton('高级 JSON 兼容分析').isConnected).toBe(true);
  });
});

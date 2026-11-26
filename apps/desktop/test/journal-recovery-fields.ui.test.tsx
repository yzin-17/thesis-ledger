// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { JournalDraftSheet } from '../src/features/journal/review/JournalDraftSheet.js';
import {
  journalInstant,
  journalLocalTime,
  JournalWindowTimeInput,
} from '../src/features/journal/review/JournalWindowTimeInput.js';
import {
  journalClick,
  journalFill,
  journalMountedCandidate,
  mountJournal,
} from './journal-mounted-harness.js';

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});

describe('复盘草稿价格与本地时间输入', () => {
  it('非法价格不能应用，逐字段修正后保留十进制精度，空值可以清除', async () => {
    const apply = vi.fn(),
      close = vi.fn();
    await mountJournal(
      <JournalDraftSheet
        open
        candidate={journalMountedCandidate()}
        value={{}}
        onApply={apply}
        onOpenChange={close}
      />,
    );
    await journalFill('计划入场价', '-1');
    await journalFill('计划退出价', '0');
    await journalFill('计划止损价', 'NaN');
    await journalClick('应用草稿');
    expect(document.querySelectorAll('input[aria-invalid="true"]')).toHaveLength(3);
    expect(apply).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    await journalFill('计划入场价', '0.00000000000000000001');
    await journalFill('计划退出价', '');
    await journalFill('计划止损价', '15.50');
    await journalClick('应用草稿');
    expect(apply).toHaveBeenCalledExactlyOnceWith({
      plannedEntry: '0.00000000000000000001',
      plannedExit: null,
      stopLoss: '15.50',
    });
    expect(close).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('时间在本机输入格式与带时区请求之间往返，保留毫秒及空边界', () => {
    for (const instant of ['2026-10-20T00:00:00.123Z', '2026-01-01T23:59:59.999Z']) {
      const local = journalLocalTime(instant);
      expect(local).not.toMatch(/Z|[+-]\d{2}:\d{2}$/);
      expect(journalInstant(local)).toBe(instant);
    }
    expect(journalLocalTime('')).toBe('');
    expect(journalInstant('')).toBe('');
  });

  it('未编辑时间只聚焦失焦和修改其他字段，真实表单提交仍保留毫秒', async () => {
    const instant = '2026-10-20T00:00:00.123Z';
    const change = vi.fn();
    const submit = vi.fn();
    const { host } = await mountJournal(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(journalInstant(String(new FormData(event.currentTarget).get('at'))));
        }}
      >
        <JournalWindowTimeInput
          name="at"
          aria-label="时间边界"
          value={instant}
          onValueChange={change}
        />
        <input aria-label="备注" defaultValue="原备注" />
      </form>,
    );
    const stored = host.querySelector<HTMLInputElement>('[data-slot="date-input-value"]')!;
    const editor = host.querySelector<HTMLInputElement>('input[type="text"]')!;
    expect(stored.validity.valid).toBe(true);
    expect(stored.step).toBe('0.001');
    expect(journalInstant(stored.value)).toBe(instant);
    await act(async () => {
      editor.focus();
      editor.blur();
    });
    await journalFill('备注', '修改后的备注');
    await act(async () => host.querySelector('form')!.requestSubmit());
    expect(change).not.toHaveBeenCalled();
    expect(submit).toHaveBeenCalledExactlyOnceWith(instant);
  });
});

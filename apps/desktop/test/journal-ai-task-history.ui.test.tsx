// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JournalAiRunPanel } from '../src/features/journal/review/JournalAiRunPanel.js';
import { JournalAiTaskHistory } from '../src/features/journal/review/JournalAiTaskHistory.js';
import {
  journalButton,
  journalClick,
  journalWait,
  mountJournal,
} from './journal-mounted-harness.js';

const api = vi.hoisted(() => ({ explanation: vi.fn(), periodExplanation: vi.fn() }));
vi.mock('../src/shared/api/client', () => ({
  getDesktopApiClient: () => ({ journalReviews: api }),
}));
const run = {
  id: '00000000-0000-4000-8000-000000000099',
  provider: '验收 Provider',
  model: '已提交模型',
  promptVersion: '验收-v2',
  algorithmVersion: 'journal-test',
  status: 'failed' as const,
  errorSummary: '进程恢复后收敛到明确终态',
  result: null,
};
describe('刷新后的已提交任务恢复', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.stubGlobal('crypto', webcrypto);
    api.explanation.mockResolvedValue(run);
    api.periodExplanation.mockResolvedValue(run);
  });
  it.each(['object', 'period'] as const)(
    '无需重新输入 %s 分析窗口即可读取已提交任务',
    async (kind) => {
      const create = vi.fn(async () => run);
      const original = await mountJournal(
        <JournalAiRunPanel
          accountId="账户一"
          mode="actual"
          kind={kind}
          scope={{ input: '冻结输入' }}
          disabled={false}
          createRun={create}
          readRun={async () => run}
        />,
      );
      await journalWait(() => expect(journalButton('开始 AI 解读').disabled).toBe(false));
      await journalClick('开始 AI 解读');
      await journalWait(() => expect(original.host.textContent).toContain(run.id));
      await original.dispose();
      const restored = await mountJournal(
        <JournalAiTaskHistory accountId="账户一" mode="actual" />,
      );
      await journalWait(() =>
        expect(restored.host.textContent).toContain('进程恢复后收敛到明确终态'),
      );
      expect(restored.host.textContent).toContain('已提交模型');
      expect(restored.host.textContent).not.toContain('开始 AI 解读');
      expect(create).toHaveBeenCalledTimes(1);
      const read = kind === 'object' ? api.explanation : api.periodExplanation;
      expect(read.mock.calls[0]!.slice(0, 2)).toEqual([
        run.id,
        { accountId: '账户一', mode: 'actual' },
      ]);
      await restored.render(
        <JournalAiTaskHistory key="account:shadow" accountId="账户一" mode="shadow" />,
      );
      await journalWait(() => expect(restored.host.textContent).not.toContain(run.id));
    },
  );
  it('历史引用不可用时可移除本机引用，服务端运行与其他任务不受影响', async () => {
    const original = await mountJournal(
      <JournalAiRunPanel
        accountId="账户一"
        mode="actual"
        kind="object"
        scope={{}}
        disabled={false}
        createRun={async () => run}
        readRun={async () => run}
      />,
    );
    await journalWait(() => expect(journalButton('开始 AI 解读').disabled).toBe(false));
    await journalClick('开始 AI 解读');
    await journalWait(() => expect(original.host.textContent).toContain(run.id));
    await original.dispose();
    api.explanation.mockRejectedValueOnce(new Error('引用已不可用'));
    const restored = await mountJournal(<JournalAiTaskHistory accountId="账户一" mode="actual" />);
    await journalWait(() => expect(restored.host.textContent).toContain('AI 状态读取失败'));
    await journalClick('移除本机任务引用');
    await journalWait(() => expect(restored.host.textContent).not.toContain('已提交的 AI 解读'));
    expect(api.explanation).toHaveBeenCalledTimes(1);
    expect(api.periodExplanation).not.toHaveBeenCalled();
  });
});

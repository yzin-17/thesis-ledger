import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { getDesktopApiClient } from '@/shared/api/client';
import { JournalAiRunPanel } from './JournalAiRunPanel.js';
import {
  forgetJournalAiTask,
  journalAiReferenceKey,
  readJournalAiTasks,
  type JournalAiTaskReference,
} from './journal-ai-reference.js';

export function JournalAiTaskHistory({
  accountId,
  mode,
}: {
  accountId: string;
  mode: 'actual' | 'shadow';
}) {
  const [selected, setSelected] = useState<JournalAiTaskReference>();
  const client = useQueryClient();
  const tasks = useQuery({
    queryKey: ['journal-review-ai-tasks', accountId, mode],
    queryFn: async () =>
      readJournalAiTasks(await journalAiReferenceKey(JSON.stringify(['tasks', accountId, mode]))),
    retry: false,
  });
  if (!tasks.data?.length) return null;
  const task = tasks.data.find((row) => row.id === selected?.id) ?? tasks.data[0]!;
  const api = getDesktopApiClient().journalReviews;
  const removeReference = async () => {
    const key = await journalAiReferenceKey(JSON.stringify(['tasks', accountId, mode]));
    forgetJournalAiTask(key, task.id);
    void client.invalidateQueries({ queryKey: ['journal-review-ai-tasks', accountId, mode] });
  };
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-medium">已提交的 AI 解读</h3>
      <p className="text-sm text-muted-foreground">
        恢复本窗口最近提交的任务，读取服务端保存的报告与状态。单笔和周期输入沿用提交时的证据。
      </p>
      <div className="flex flex-wrap gap-2">
        {tasks.data.map((row) => (
          <Button
            key={row.id}
            variant={row.id === task.id ? 'secondary' : 'outline'}
            onClick={() => setSelected(row)}
          >
            {row.kind === 'object' ? '单笔解读' : '周期解读'} · {row.id}
          </Button>
        ))}
      </div>
      <Button variant="ghost" className="self-start" onClick={() => void removeReference()}>
        移除本机任务引用
      </Button>
      <JournalAiRunPanel
        key={task.id}
        accountId={accountId}
        mode={mode}
        kind={task.kind}
        scope={{ historicalRunId: task.id }}
        existingRunId={task.id}
        disabled
        createRun={() => Promise.reject(new Error('历史任务只能读取'))}
        readRun={(id, signal) =>
          task.kind === 'object'
            ? api.explanation(id, { accountId, mode }, signal)
            : api.periodExplanation(id, { accountId, mode }, signal)
        }
      />
    </div>
  );
}

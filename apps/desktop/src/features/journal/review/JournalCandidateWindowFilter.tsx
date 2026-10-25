import { useState } from 'react';
import { journalReviewQuerySchema } from '@thesis-ledger/schemas';
import { journalReviewWindow } from '@thesis-ledger/domain';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { JournalWindowTimeInput } from './JournalWindowTimeInput.js';
import { JournalRequestError } from './JournalReviewFeedback.js';

type CandidateWindow = { start: string; end: string };

export function JournalCandidateWindowFilter({ accountId, mode, window, onApply }: {
  accountId: string;
  mode: 'actual' | 'shadow';
  window: CandidateWindow;
  onApply: (window: CandidateWindow) => void;
}) {
  const [draftWindow, setDraftWindow] = useState(window);
  const [error, setError] = useState<Error | null>(null);
  const applyWindow = () => {
    try {
      const input = {
        ...(draftWindow.start ? { start: draftWindow.start } : {}),
        ...(draftWindow.end ? { end: draftWindow.end } : {}),
      };
      journalReviewQuerySchema.parse({ accountId, mode, ...input });
      journalReviewWindow(input);
      onApply(draftWindow);
      setError(null);
    } catch {
      setError(new Error('请选择有效时间，结束时间不能早于开始时间'));
    }
  };
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <FieldGroup className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <Field>
          <FieldLabel>开始时间（可选）</FieldLabel>
          <JournalWindowTimeInput
            aria-label="候选开始时间"
            value={draftWindow.start}
            onValueChange={(start) => setDraftWindow({ ...draftWindow, start })}
          />
        </Field>
        <Field>
          <FieldLabel>结束时间（可选）</FieldLabel>
          <JournalWindowTimeInput
            aria-label="候选结束时间"
            value={draftWindow.end}
            onValueChange={(end) => setDraftWindow({ ...draftWindow, end })}
          />
        </Field>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-1">
          <Button onClick={applyWindow}>应用候选窗口</Button>
          <Button variant="outline" onClick={() => setDraftWindow({ start: '', end: '' })}>
            清空时间
          </Button>
        </div>
      </FieldGroup>
      <p className="text-xs text-muted-foreground">按本机时区输入，开始时刻计入、结束时刻不计入；留空表示不限。</p>
      {error && <JournalRequestError title="候选窗口无效" error={error} />}
    </div>
  );
}

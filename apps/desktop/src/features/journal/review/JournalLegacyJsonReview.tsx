import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { completedTradeSchema } from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { requestDesktopJson } from '../../shared/request.js';
import { JournalRequestError } from './JournalReviewFeedback.js';

function legacyInput(text: string) {
  try {
    return completedTradeSchema.parse(JSON.parse(text));
  } catch {
    throw new Error('请输入有效的旧交易 JSON，并提供标的、开仓时间、退出时间和已实现收益');
  }
}

export function JournalLegacyJsonReview() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const analysis = useMutation({
    mutationFn: () => {
      const input = legacyInput(text);
      return requestDesktopJson<unknown>('/journal/analysis/planned-vs-actual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
    },
  });
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        高级 JSON 兼容分析
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>高级 JSON 兼容分析</SheetTitle>
            <SheetDescription>
              仅用于旧格式调试。结果保留旧 number 口径，不进入正式对象、周期统计或复盘快照。
            </SheetDescription>
          </SheetHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>旧交易 JSON</FieldLabel>
              <Textarea
                aria-label="旧交易 JSON"
                rows={14}
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  analysis.reset();
                }}
              />
            </Field>
          </FieldGroup>
          <Button disabled={analysis.isPending} onClick={() => analysis.mutate()}>
            分析兼容输入
          </Button>
          {analysis.isError && (
            <JournalRequestError title="兼容输入未完成分析" error={analysis.error} />
          )}
          {analysis.isSuccess && (
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
              {JSON.stringify(analysis.data, null, 2)}
            </pre>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

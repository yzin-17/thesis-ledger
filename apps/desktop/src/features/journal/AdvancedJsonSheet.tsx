import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export function AdvancedJsonSheet({
  open,
  onOpenChange,
  value,
  mode,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: unknown;
  mode: 'single' | 'period';
  onApply: (value: unknown) => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setText(JSON.stringify(value, null, 2));
    setError(null);
  }, [open, value]);

  const apply = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError('JSON 解析失败：请检查逗号、引号和括号。');
      return;
    }
    if (mode === 'single' && !isRecord(parsed)) {
      setError('单笔复盘需要一个 JSON 对象。');
      return;
    }
    if (mode === 'period' && (!Array.isArray(parsed) || parsed.length === 0)) {
      setError('周期复盘需要包含至少一笔交易的 JSON 数组。');
      return;
    }
    onApply(parsed);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[min(100vw,48rem)] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>高级 JSON 入口</SheetTitle>
          <SheetDescription>
            {mode === 'single' ? '适用于单笔交易对象。' : '适用于交易数组。'}{' '}
            仅参与本次只读复盘，不会自动写入 Ledger。
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>输入无效</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setError(null);
            }}
            rows={20}
            spellCheck={false}
            aria-label={mode === 'single' ? '单笔交易 JSON' : '周期交易数组 JSON'}
          />
        </div>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={apply}>
            应用到本次复盘
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

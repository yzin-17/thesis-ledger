import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function AuthoringDraftRecovery({
  content,
  disabled,
  onReadLatest,
  onDiscard,
}: {
  content: unknown;
  disabled: boolean;
  onReadLatest: () => void;
  onDiscard?: (() => void) | undefined;
}) {
  const [confirm, setConfirm] = useState<'reload' | 'discard' | null>(null);
  const [copied, setCopied] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        disabled={disabled}
        onClick={() => {
          void navigator.clipboard.writeText(JSON.stringify(content, null, 2)).then(
            () => {
              setCopied(true);
              setFailure(null);
            },
            () => setFailure('无法复制，请在高级定义编辑中手动保留文本'),
          );
        }}
      >
        {copied ? '已复制本地草稿' : '复制本地草稿'}
      </Button>
      <Button variant="outline" disabled={disabled} onClick={() => setConfirm('reload')}>
        读取服务器最新草稿
      </Button>
      {onDiscard && (
        <Button variant="outline" disabled={disabled} onClick={() => setConfirm('discard')}>
          丢弃这个草稿
        </Button>
      )}
      {failure && <p role="alert">{failure}</p>}
      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open && !disabled) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === 'discard' ? '丢弃这个编写草稿？' : '使用服务器最新内容？'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'discard'
                ? '草稿会结束，不能继续编辑；已有调用记录保留。'
                : '当前尚未保存的输入会被服务器最新草稿替换。可先复制本地草稿保留内容。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" disabled={disabled} onClick={() => setConfirm(null)}>
              继续编辑
            </Button>
            <Button
              disabled={disabled}
              onClick={() => {
                if (disabled) return;
                if (confirm === 'discard') onDiscard?.();
                else onReadLatest();
                setConfirm(null);
              }}
            >
              确认
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

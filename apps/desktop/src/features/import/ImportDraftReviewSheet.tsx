import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ImportDraftReview } from './ImportDraftReview.js';

export function ImportDraftReviewSheet({
  open,
  accountId,
  ledgerRevision,
  ledgerReady,
  onOpenChange,
  onDirtyChange,
  onBusyChange,
  onPortfolioChanged,
  onReadLedger,
}: {
  open: boolean;
  accountId: string;
  ledgerRevision: string;
  ledgerReady: boolean;
  onOpenChange: (open: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onPortfolioChanged: () => void;
  onReadLedger: () => Promise<void>;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="detail" className="h-[100dvh] overflow-auto p-6">
        <SheetHeader>
          <SheetTitle>持仓快照导入草稿</SheetTitle>
          <SheetDescription>
            审核已有草稿，人工修订与账本提交分开确认；原始证据、来源行和冲突状态保留。
          </SheetDescription>
        </SheetHeader>
        <ImportDraftReview
          key={accountId}
          accountId={accountId}
          ledgerRevision={ledgerRevision}
          ledgerReady={ledgerReady}
          onDirtyChange={onDirtyChange}
          onBusyChange={onBusyChange}
          onPortfolioChanged={onPortfolioChanged}
          onReadLedger={onReadLedger}
        />
      </SheetContent>
    </Sheet>
  );
}

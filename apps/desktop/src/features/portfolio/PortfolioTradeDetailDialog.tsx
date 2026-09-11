import { useState } from 'react';
import type { TradeSummaryResponseV2 } from '@thesis-ledger/api-client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { PortfolioTradeDetailTabs } from './PortfolioTradeDetailSections.js';
import { PortfolioTradeOpeningBoundarySheet } from './PortfolioTradeOpeningBoundarySheet.js';
import { usePortfolioTradeQuery } from './portfolio-trade.queries.js';
import type { PortfolioTradeReviewTarget } from './portfolio-trade.types.js';
import type { Account, PortfolioMode } from './portfolio.types.js';

const accountName = (accounts: Account[], accountId: string) =>
  accounts.find((account) => account.id === accountId)?.name ?? accountId;

export function PortfolioTradeDetailDialog({
  trade,
  accounts,
  mode,
  open,
  onOpenChange,
  onReview,
}: {
  trade: TradeSummaryResponseV2 | null;
  accounts: Account[];
  mode: PortfolioMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReview: (target: PortfolioTradeReviewTarget) => void;
}) {
  const [openingBoundaryOpen, setOpeningBoundaryOpen] = useState(false);
  const accountId = trade?.accountId ?? '';
  const detailQuery = usePortfolioTradeQuery(
    accountId,
    trade?.id ?? '',
    mode,
    open && Boolean(trade),
  );
  const title = trade?.assetName ?? trade?.symbol ?? '交易周期';
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setOpeningBoundaryOpen(false);
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        aria-describedby="trade-detail-description"
        className="flex max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1120px]"
      >
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-14 text-left">
          <DialogTitle className="text-lg font-semibold">
            {title}
            {trade?.assetName ? ` · ${trade.symbol}` : ''}
          </DialogTitle>
          <DialogDescription id="trade-detail-description">
            只读查看交易投影、证据与复盘入口；事实更正请回到账户数据。
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {detailQuery.isPending ? (
            <div className="grid gap-3" role="status" aria-label="正在读取交易详情">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : null}
          {detailQuery.isError ? (
            <div className="rounded-md border border-destructive/40 p-3 text-sm" role="alert">
              <p className="m-0">交易详情读取失败，请刷新后重试。</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => void detailQuery.refetch()}
              >
                重试读取
              </Button>
            </div>
          ) : null}
          {detailQuery.data ? (
            <>
              <PortfolioTradeDetailTabs
                detail={detailQuery.data}
                accountLabel={accountName(accounts, detailQuery.data.accountId)}
                onReview={onReview}
                onSupplementOpening={() => setOpeningBoundaryOpen(true)}
              />
              <PortfolioTradeOpeningBoundarySheet
                detail={detailQuery.data}
                open={openingBoundaryOpen}
                onOpenChange={setOpeningBoundaryOpen}
              />
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

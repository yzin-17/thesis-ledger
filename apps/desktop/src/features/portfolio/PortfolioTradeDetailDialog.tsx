import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { useState } from 'react';
import type { TradeSummaryResponse } from '@thesis-ledger/api-client';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LoadingState } from '@/components/ui/spinner';
import { PortfolioTradeDetailTabs } from './PortfolioTradeDetailSections.js';
import { PortfolioTradeOpeningBoundarySheet } from './PortfolioTradeOpeningBoundarySheet.js';
import { usePortfolioTradeQuery } from './portfolio-trade.queries.js';
import type { PortfolioTradeReviewTarget } from './portfolio-trade.types.js';
import type { Account, PortfolioMode } from './portfolio.types.js';

const accountName = (accounts: Account[], accountId: string) =>
  accounts.find((account) => account.id === accountId)?.name ?? '账户名称暂不可用';

export function PortfolioTradeDetailDialog({
  trade,
  accounts,
  mode,
  open,
  onOpenChange,
  onReview,
}: {
  trade: TradeSummaryResponse | null;
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
    if (!nextOpen && openingBoundaryOpen) return;
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
            <LoadingState label="正在读取交易详情" />
          ) : null}
          {detailQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>交易详情读取失败</AlertTitle>
              <AlertDescription>请重试读取；确认当前详情前不能补录。</AlertDescription>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => void detailQuery.refetch()}
              >
                重试读取
              </Button>
            </Alert>
          ) : null}
          <ListRefreshRegion refreshing={detailQuery.isRefetching} label="正在刷新交易明细">
            {detailQuery.data ? (
              <>
                <PortfolioTradeDetailTabs
                  detail={detailQuery.data}
                  accountLabel={accountName(accounts, detailQuery.data.accountId)}
                  onReview={onReview}
                  {...(detailQuery.isError || detailQuery.isFetching
                    ? {}
                    : { onSupplementOpening: () => setOpeningBoundaryOpen(true) })}
                />
                <PortfolioTradeOpeningBoundarySheet
                  detail={detailQuery.data}
                  open={openingBoundaryOpen}
                  onOpenChange={setOpeningBoundaryOpen}
                  readOnly={detailQuery.isError || detailQuery.isFetching}
                />
              </>
            ) : null}
          </ListRefreshRegion>
        </div>
      </DialogContent>
    </Dialog>
  );
}

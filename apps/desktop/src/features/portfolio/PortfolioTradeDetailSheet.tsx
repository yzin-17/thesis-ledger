import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { TradeDetailResponseV2, TradeSummaryResponseV2 } from '@thesis-ledger/api-client';
import type { ReactNode } from 'react';
import { usePortfolioTradeQuery } from './portfolio-trade.queries.js';
import type { Account, PortfolioMode } from './portfolio.types.js';

export type PortfolioTradeReviewTarget = {
  accountId: string;
  tradeId: string;
  reviewObjectType: 'TRADE_CYCLE' | 'CLOSE_SLICE';
  closeSliceId?: string;
};

const formatDateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString('zh-CN') : '—';

const formatDecimal = (value: string | null | undefined) => value ?? '—';

const lifecycleLabel = (value: TradeSummaryResponseV2['lifecycle']) =>
  value === 'ACTIVE' ? '进行中' : '已结束';

const exitProgressLabel = (value: TradeSummaryResponseV2['exitProgress']) => {
  if (value === 'FULL') return '已全部平仓';
  if (value === 'PARTIAL') return '部分平仓';
  return '尚无平仓';
};

const endEvidenceLabel = (value: TradeSummaryResponseV2['endEvidence']) => {
  if (value === 'SELL_EXECUTION') return '卖出成交结束';
  if (value === 'BALANCE_OBSERVATION') return '余额观察结束';
  return '结束证据未知';
};

const completenessLabel = (value: TradeSummaryResponseV2['completeness']) => {
  if (value === 'COMPLETE') return '证据完整';
  if (value === 'CONFLICTED') return '证据冲突';
  return '证据不完整';
};

const accountName = (accounts: Account[], accountId: string) =>
  accounts.find((account) => account.id === accountId)?.name ?? accountId;

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono text-sm">{value}</dd>
    </div>
  );
}

function DetailTable({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border" aria-label={label}>
      <table className="w-full min-w-[36rem] text-left text-xs">{children}</table>
    </div>
  );
}

function TradeDetailContent({
  detail,
  accountLabel,
  onReview,
}: {
  detail: TradeDetailResponseV2;
  accountLabel: string;
  onReview: (target: PortfolioTradeReviewTarget) => void;
}) {
  return (
    <div className="flex flex-col gap-4 px-4 pb-6">
      <Card className="shadow-none">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{detail.symbol} · 交易周期</CardTitle>
              <CardDescription>
                {accountLabel} · {detail.accountMode === 'shadow' ? '模拟账户' : '实际账户'} ·{' '}
                {formatDateTime(detail.openedAt)} → {formatDateTime(detail.closedAt)}
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                onReview({
                  accountId: detail.accountId,
                  tradeId: detail.id,
                  reviewObjectType: 'TRADE_CYCLE',
                })
              }
            >
              完整交易复盘
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{lifecycleLabel(detail.lifecycle)}</Badge>
            <Badge variant="outline">{exitProgressLabel(detail.exitProgress)}</Badge>
            <Badge variant="outline">{completenessLabel(detail.completeness)}</Badge>
            <Badge variant="outline">{endEvidenceLabel(detail.endEvidence)}</Badge>
            {detail.costEstimated && <Badge variant="outline">成本估算</Badge>}
          </div>
          <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <DetailMetric label="来源数量" value={detail.sourceQuantity} />
            <DetailMetric label="已平仓数量" value={detail.closedQuantity} />
            <DetailMetric label="剩余数量" value={detail.remainingQuantity} />
            <DetailMetric label="净实现盈亏" value={formatDecimal(detail.netRealizedPnl)} />
            <DetailMetric label="毛实现盈亏" value={formatDecimal(detail.grossRealizedPnl)} />
            <DetailMetric label="净收益率" value={formatDecimal(detail.realizedNetReturnRate)} />
            <DetailMetric label="投影代数" value={detail.projectionGeneration} />
            <DetailMetric label="算法版本" value={detail.algorithmVersion} />
          </dl>
          <p className="m-0 text-xs leading-5 text-muted-foreground">
            金额保留来源币种；Trade Projection
            不把不同币种静默合并，外汇转换证据在组合估值层单独展示。
          </p>
          {detail.excludedReasons.length > 0 && (
            <div className="rounded-md border border-dashed border-border p-3 text-xs">
              <p className="m-0 font-medium">默认统计排除原因</p>
              <p className="m-0 mt-1 text-muted-foreground">{detail.excludedReasons.join('、')}</p>
            </div>
          )}
          {(detail.issues.length > 0 || detail.costIssues.length > 0) && (
            <div className="rounded-md border border-dashed border-border p-3 text-xs">
              <p className="m-0 font-medium">需要复核的投影问题</p>
              <p className="m-0 mt-1 text-muted-foreground">
                {[...detail.issues, ...detail.costIssues].join('、')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <section className="flex flex-col gap-2" aria-labelledby="trade-entry-legs-title">
        <div>
          <h3 id="trade-entry-legs-title" className="m-0 text-sm font-medium">
            Entry Legs
          </h3>
          <p className="m-0 mt-1 text-xs text-muted-foreground">每个建仓事实及其剩余成本。</p>
        </div>
        {detail.entryLegs.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            暂无建仓成交。
          </p>
        ) : (
          <DetailTable label="Entry Legs">
            <thead className="border-b bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-3 py-2">时间</th>
                <th className="px-3 py-2">币种</th>
                <th className="px-3 py-2">价格</th>
                <th className="px-3 py-2">数量</th>
                <th className="px-3 py-2">剩余数量</th>
                <th className="px-3 py-2">剩余成本</th>
              </tr>
            </thead>
            <tbody>
              {detail.entryLegs.map((entry) => (
                <tr key={entry.id} className="border-b last:border-0">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {formatDateTime(entry.occurredAt)}
                  </td>
                  <td className="px-3 py-2">{entry.currency}</td>
                  <td className="px-3 py-2 font-mono">{entry.price}</td>
                  <td className="px-3 py-2 font-mono">{entry.quantity}</td>
                  <td className="px-3 py-2 font-mono">{entry.remainingQuantity}</td>
                  <td className="px-3 py-2 font-mono">{formatDecimal(entry.remainingCost)}</td>
                </tr>
              ))}
            </tbody>
          </DetailTable>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="trade-baseline-title">
        <div>
          <h3 id="trade-baseline-title" className="m-0 text-sm font-medium">
            基线观察
          </h3>
          <p className="m-0 mt-1 text-xs text-muted-foreground">
            基线是来源证据，不伪装成真实买入。
          </p>
        </div>
        {detail.baselineComponents.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            暂无基线组成。
          </p>
        ) : (
          <DetailTable label="基线观察组成">
            <thead className="border-b bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-3 py-2">批次</th>
                <th className="px-3 py-2">范围</th>
                <th className="px-3 py-2">观察数量</th>
                <th className="px-3 py-2">已纳入数量</th>
                <th className="px-3 py-2">剩余数量</th>
                <th className="px-3 py-2">平均成本</th>
              </tr>
            </thead>
            <tbody>
              {detail.baselineComponents.map((component) => (
                <tr key={component.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-mono">{component.batchId}</td>
                  <td className="px-3 py-2">{component.batchScope}</td>
                  <td className="px-3 py-2 font-mono">{component.observedQuantity}</td>
                  <td className="px-3 py-2 font-mono">{component.quantity}</td>
                  <td className="px-3 py-2 font-mono">{component.remainingQuantity}</td>
                  <td className="px-3 py-2 font-mono">{formatDecimal(component.averageCost)}</td>
                </tr>
              ))}
            </tbody>
          </DetailTable>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="trade-close-slices-title">
        <div>
          <h3 id="trade-close-slices-title" className="m-0 text-sm font-medium">
            Close Slices
          </h3>
          <p className="m-0 mt-1 text-xs text-muted-foreground">
            每次卖出独立记录，可单独进入减仓复盘。
          </p>
        </div>
        {detail.closeSlices.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            暂无真实卖出片段。
          </p>
        ) : (
          <DetailTable label="Close Slices">
            <thead className="border-b bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-3 py-2">时间</th>
                <th className="px-3 py-2">币种</th>
                <th className="px-3 py-2">退出价格</th>
                <th className="px-3 py-2">数量</th>
                <th className="px-3 py-2">剩余数量</th>
                <th className="px-3 py-2">净实现盈亏</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {detail.closeSlices.map((slice) => (
                <tr key={slice.id} className="border-b last:border-0">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {formatDateTime(slice.occurredAt)}
                  </td>
                  <td className="px-3 py-2">{slice.currency}</td>
                  <td className="px-3 py-2 font-mono">{formatDecimal(slice.price)}</td>
                  <td className="px-3 py-2 font-mono">{slice.quantity}</td>
                  <td className="px-3 py-2 font-mono">{slice.remainingQuantityAfter}</td>
                  <td className="px-3 py-2 font-mono">{formatDecimal(slice.netRealizedPnl)}</td>
                  <td className="px-3 py-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="link"
                      className="h-auto p-0"
                      onClick={() =>
                        onReview({
                          accountId: detail.accountId,
                          tradeId: detail.id,
                          closeSliceId: slice.id,
                          reviewObjectType: 'CLOSE_SLICE',
                        })
                      }
                    >
                      减仓复盘
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </DetailTable>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-3" aria-label="交易附属证据">
        <EvidenceList title="公司行动" count={detail.corporateActions.length}>
          {detail.corporateActions.map((action) => (
            <li key={action.id}>
              {action.type} · {formatDateTime(action.occurredAt)} · {action.positionQuantityBefore}{' '}
              → {action.positionQuantityAfter}
            </li>
          ))}
        </EvidenceList>
        <EvidenceList title="分红归属" count={detail.dividendAttributions.length}>
          {detail.dividendAttributions.map((dividend) => (
            <li key={dividend.id}>
              {dividend.amount} {dividend.currency} · {formatDateTime(dividend.occurredAt)}
            </li>
          ))}
        </EvidenceList>
        <EvidenceList title="证据来源" count={detail.evidenceSources.length}>
          {detail.evidenceSources.map((evidence) => (
            <li key={evidence.id}>
              {evidence.kind} · {evidence.source.channel}
            </li>
          ))}
        </EvidenceList>
      </section>
    </div>
  );
}

function EvidenceList({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription>{count} 条</CardDescription>
      </CardHeader>
      <CardContent>
        {count === 0 ? (
          <p className="m-0 text-xs text-muted-foreground">暂无记录。</p>
        ) : (
          <ul className="m-0 list-disc space-y-1 pl-4 text-xs text-muted-foreground">{children}</ul>
        )}
      </CardContent>
    </Card>
  );
}

export function PortfolioTradeDetailSheet({
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
  const accountId = trade?.accountId ?? '';
  const detailQuery = usePortfolioTradeQuery(
    accountId,
    trade?.id ?? '',
    mode,
    open && Boolean(trade),
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-4xl">
        <SheetHeader>
          <SheetTitle>{trade ? `${trade.symbol} · Trade 详情` : 'Trade 详情'}</SheetTitle>
          <SheetDescription>
            只读查看投影事实、证据和复盘入口；事实更正请回到账户数据。
          </SheetDescription>
        </SheetHeader>
        {detailQuery.isPending && (
          <p className="px-4 text-sm text-muted-foreground" role="status">
            正在读取 Trade 详情…
          </p>
        )}
        {detailQuery.isError && (
          <div className="mx-4 rounded-md border border-destructive/40 p-3 text-sm" role="alert">
            <p className="m-0">Trade 详情读取失败，请刷新后重试。</p>
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
        )}
        {detailQuery.data && (
          <TradeDetailContent
            detail={detailQuery.data}
            accountLabel={accountName(accounts, detailQuery.data.accountId)}
            onReview={onReview}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

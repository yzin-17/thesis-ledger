import type { ReactNode } from 'react';
import type { TradeDetailResponseV2 } from '@thesis-ledger/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StickyTableActionCell, StickyTableActionHeader } from '../shared/StickyTableActions.js';
import {
  corporateActionLabel,
  evidenceKindLabel,
  evidenceSourceLabel,
  formatTradeDateTime,
  formatTradeDecimal,
  tradeBatchScopeLabel,
  tradeCompletenessLabel,
  tradeEndEvidenceLabel,
  tradeExclusionLabels,
  tradeExitProgressLabel,
  tradeIssueLabels,
  tradeLifecycleLabel,
} from './portfolio-trade.display.js';
import type { PortfolioTradeReviewTarget } from './portfolio-trade.types.js';

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono text-sm font-medium tabular-nums">{value}</dd>
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

function SectionHeading({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <h3 id={id} className="m-0 text-sm font-medium">
        {title}
      </h3>
      <p className="mb-0 mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function EmptyDetail({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
      {children}
    </p>
  );
}

function AttentionList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="grid gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
      <p className="m-0 font-medium">{title}</p>
      <ul className="m-0 grid list-disc gap-1 pl-4 text-muted-foreground">
        {items.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function TradeOverview({
  detail,
  accountLabel,
  onReview,
}: {
  detail: TradeDetailResponseV2;
  accountLabel: string;
  onReview: (target: PortfolioTradeReviewTarget) => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{tradeLifecycleLabel(detail.lifecycle)}</Badge>
            <Badge variant="outline">{tradeExitProgressLabel(detail.exitProgress)}</Badge>
            <Badge variant="outline">{tradeCompletenessLabel(detail.completeness)}</Badge>
            <Badge variant="outline">{tradeEndEvidenceLabel(detail.endEvidence)}</Badge>
            {detail.costEstimated ? <Badge variant="outline">成本估算</Badge> : null}
          </div>
          <p className="m-0 text-xs text-muted-foreground">
            {accountLabel} · {detail.accountMode === 'shadow' ? '模拟账户' : '实际账户'} ·{' '}
            {formatTradeDateTime(detail.openedAt)} 至 {formatTradeDateTime(detail.closedAt)}
          </p>
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
      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <DetailMetric label="来源数量" value={detail.sourceQuantity} />
        <DetailMetric label="已平仓数量" value={detail.closedQuantity} />
        <DetailMetric label="剩余数量" value={detail.remainingQuantity} />
        <DetailMetric label="净实现盈亏" value={formatTradeDecimal(detail.netRealizedPnl)} />
        <DetailMetric label="毛实现盈亏" value={formatTradeDecimal(detail.grossRealizedPnl)} />
        <DetailMetric label="净收益率" value={formatTradeDecimal(detail.realizedNetReturnRate)} />
      </dl>
      <p className="m-0 text-xs leading-5 text-muted-foreground">
        金额保留来源币种；不同币种不会被静默合并，外汇转换证据在组合估值层单独展示。
      </p>
      <AttentionList
        title="暂不纳入默认统计"
        items={tradeExclusionLabels(detail.excludedReasons)}
      />
      <AttentionList title="需要复核" items={tradeIssueLabels(detail)} />
    </div>
  );
}

function EntryLegs({ detail }: { detail: TradeDetailResponseV2 }) {
  return (
    <section className="grid gap-2" aria-labelledby="trade-entry-legs-title">
      <SectionHeading
        id="trade-entry-legs-title"
        title="建仓明细"
        description="每个建仓事实及其剩余成本。"
      />
      {detail.entryLegs.length === 0 ? (
        <EmptyDetail>暂无建仓成交。</EmptyDetail>
      ) : (
        <DetailTable label="建仓明细">
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
                <td className="whitespace-nowrap px-3 py-2">
                  {formatTradeDateTime(entry.occurredAt)}
                </td>
                <td className="px-3 py-2">{entry.currency}</td>
                <td className="px-3 py-2 font-mono">{entry.price}</td>
                <td className="px-3 py-2 font-mono">{entry.quantity}</td>
                <td className="px-3 py-2 font-mono">{entry.remainingQuantity}</td>
                <td className="px-3 py-2 font-mono">{formatTradeDecimal(entry.remainingCost)}</td>
              </tr>
            ))}
          </tbody>
        </DetailTable>
      )}
    </section>
  );
}

function BaselineComponents({ detail }: { detail: TradeDetailResponseV2 }) {
  return (
    <section className="grid gap-2" aria-labelledby="trade-baseline-title">
      <SectionHeading
        id="trade-baseline-title"
        title="持仓快照"
        description="快照是来源证据，不代表真实买入。"
      />
      {detail.baselineComponents.length === 0 ? (
        <EmptyDetail>暂无快照组成。</EmptyDetail>
      ) : (
        <DetailTable label="持仓快照组成">
          <thead className="border-b bg-muted/30 text-muted-foreground">
            <tr>
              <th className="px-3 py-2">批次</th>
              <th className="px-3 py-2">范围</th>
              <th className="px-3 py-2">快照数量</th>
              <th className="px-3 py-2">已纳入数量</th>
              <th className="px-3 py-2">剩余数量</th>
              <th className="px-3 py-2">平均成本</th>
            </tr>
          </thead>
          <tbody>
            {detail.baselineComponents.map((component) => (
              <tr key={component.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono">{component.batchId}</td>
                <td className="px-3 py-2">{tradeBatchScopeLabel(component.batchScope)}</td>
                <td className="px-3 py-2 font-mono">{component.observedQuantity}</td>
                <td className="px-3 py-2 font-mono">{component.quantity}</td>
                <td className="px-3 py-2 font-mono">{component.remainingQuantity}</td>
                <td className="px-3 py-2 font-mono">{formatTradeDecimal(component.averageCost)}</td>
              </tr>
            ))}
          </tbody>
        </DetailTable>
      )}
    </section>
  );
}

function CloseSlices({
  detail,
  onReview,
}: {
  detail: TradeDetailResponseV2;
  onReview: (target: PortfolioTradeReviewTarget) => void;
}) {
  return (
    <section className="grid gap-2" aria-labelledby="trade-close-slices-title">
      <SectionHeading
        id="trade-close-slices-title"
        title="平仓明细"
        description="每次卖出独立记录，可单独进入减仓复盘。"
      />
      {detail.closeSlices.length === 0 ? (
        <EmptyDetail>暂无真实卖出记录。</EmptyDetail>
      ) : (
        <DetailTable label="平仓明细">
          <thead className="border-b bg-muted/30 text-muted-foreground">
            <tr>
              <th className="px-3 py-2">时间</th>
              <th className="px-3 py-2">币种</th>
              <th className="px-3 py-2">退出价格</th>
              <th className="px-3 py-2">数量</th>
              <th className="px-3 py-2">剩余数量</th>
              <th className="px-3 py-2">净实现盈亏</th>
              <StickyTableActionHeader className="px-3 py-2">操作</StickyTableActionHeader>
            </tr>
          </thead>
          <tbody>
            {detail.closeSlices.map((slice) => (
              <tr key={slice.id} className="border-b last:border-0">
                <td className="whitespace-nowrap px-3 py-2">
                  {formatTradeDateTime(slice.occurredAt)}
                </td>
                <td className="px-3 py-2">{slice.currency}</td>
                <td className="px-3 py-2 font-mono">{formatTradeDecimal(slice.price)}</td>
                <td className="px-3 py-2 font-mono">{slice.quantity}</td>
                <td className="px-3 py-2 font-mono">{slice.remainingQuantityAfter}</td>
                <td className="px-3 py-2 font-mono">{formatTradeDecimal(slice.netRealizedPnl)}</td>
                <StickyTableActionCell className="px-3 py-2">
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
                </StickyTableActionCell>
              </tr>
            ))}
          </tbody>
        </DetailTable>
      )}
    </section>
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
      <CardHeader className="gap-1 p-4">
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription>{count} 条</CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {count === 0 ? (
          <p className="m-0 text-xs text-muted-foreground">暂无记录。</p>
        ) : (
          <ul className="m-0 grid list-disc gap-1 pl-4 text-xs text-muted-foreground">
            {children}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TradeEvidence({ detail }: { detail: TradeDetailResponseV2 }) {
  const rawIssues = [...detail.issues, ...detail.costIssues];
  return (
    <div className="grid gap-4">
      <section className="grid gap-3 md:grid-cols-3" aria-label="交易附属证据">
        <EvidenceList title="公司行动" count={detail.corporateActions.length}>
          {detail.corporateActions.map((action) => (
            <li key={action.id}>
              {corporateActionLabel(action.type)} · {formatTradeDateTime(action.occurredAt)} ·{' '}
              {action.positionQuantityBefore} 至 {action.positionQuantityAfter}
            </li>
          ))}
        </EvidenceList>
        <EvidenceList title="分红归属" count={detail.dividendAttributions.length}>
          {detail.dividendAttributions.map((dividend) => (
            <li key={dividend.id}>
              {dividend.amount} {dividend.currency} · {formatTradeDateTime(dividend.occurredAt)}
            </li>
          ))}
        </EvidenceList>
        <EvidenceList title="证据来源" count={detail.evidenceSources.length}>
          {detail.evidenceSources.map((evidence) => (
            <li key={evidence.id}>
              {evidenceKindLabel(evidence.kind)} · {evidenceSourceLabel(evidence.source)}
            </li>
          ))}
        </EvidenceList>
      </section>
      <details className="rounded-md border border-border bg-muted/20 p-3 text-xs">
        <summary className="cursor-pointer font-medium">技术信息</summary>
        <dl className="mt-3 grid gap-2 text-muted-foreground sm:grid-cols-2">
          <div>
            <dt>投影代数</dt>
            <dd className="m-0 font-mono text-foreground">{detail.projectionGeneration}</dd>
          </div>
          <div>
            <dt>算法版本</dt>
            <dd className="m-0 font-mono text-foreground">{detail.algorithmVersion}</dd>
          </div>
          <div>
            <dt>原始统计排除代码</dt>
            <dd className="m-0 break-all font-mono text-foreground">
              {detail.excludedReasons.join('、') || '无'}
            </dd>
          </div>
          <div>
            <dt>原始问题代码</dt>
            <dd className="m-0 break-all font-mono text-foreground">
              {rawIssues.join('、') || '无'}
            </dd>
          </div>
        </dl>
      </details>
    </div>
  );
}

export function PortfolioTradeDetailTabs({
  detail,
  accountLabel,
  onReview,
}: {
  detail: TradeDetailResponseV2;
  accountLabel: string;
  onReview: (target: PortfolioTradeReviewTarget) => void;
}) {
  return (
    <Tabs defaultValue="overview">
      <TabsList variant="line" className="w-full">
        <TabsTrigger value="overview">交易概览</TabsTrigger>
        <TabsTrigger value="positions">持仓构成</TabsTrigger>
        <TabsTrigger value="evidence">证据与技术信息</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="pt-4">
        <TradeOverview detail={detail} accountLabel={accountLabel} onReview={onReview} />
      </TabsContent>
      <TabsContent value="positions" className="grid gap-5 pt-4">
        <EntryLegs detail={detail} />
        <BaselineComponents detail={detail} />
        <CloseSlices detail={detail} onReview={onReview} />
      </TabsContent>
      <TabsContent value="evidence" className="pt-4">
        <TradeEvidence detail={detail} />
      </TabsContent>
    </Tabs>
  );
}

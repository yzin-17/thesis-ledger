import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { LoadingState } from '@/components/ui/spinner';

import { SlidersHorizontal } from 'lucide-react';

import { cn } from '@/lib/utils';
import { marketToneClass, marketToneForValue } from '@/ui/market-color';
import type { Account } from '../portfolio/portfolio.types.js';

import type { JournalReviewCandidate, ReviewEvidenceDraft, ReviewTrade } from './journal.types.js';

export function AccountState({
  accounts,
  pending,
  error,
  onRetry,
  onNavigateAccounts,
  onNavigatePosition,
}: {
  accounts: Account[];
  pending: boolean;
  error: boolean;
  onRetry?: (() => void) | undefined;
  onNavigateAccounts?: (() => void) | undefined;
  onNavigatePosition?: (() => void) | undefined;
}) {
  if (pending) {
    return <LoadingState label="正在加载账户" />;
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>账户读取失败</AlertTitle>
        <AlertDescription>无法确定复盘账户范围。请检查服务状态后重试。</AlertDescription>
        {onRetry && (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            重新加载账户
          </Button>
        )}
      </Alert>
    );
  }
  if (accounts.length === 0) {
    return (
      <Empty className="min-h-64 rounded-xl border bg-card p-8">
        <EmptyHeader>
          <EmptyTitle>还没有可用账户</EmptyTitle>
          <EmptyDescription>先创建账户或导入持仓，投资复盘才能读取已平仓交易。</EmptyDescription>
        </EmptyHeader>
        {(onNavigateAccounts || onNavigatePosition) && (
          <div className="flex flex-wrap justify-center gap-2">
            {onNavigateAccounts && (
              <Button type="button" onClick={onNavigateAccounts}>
                去账户管理
              </Button>
            )}
            {onNavigatePosition && (
              <Button type="button" variant="outline" onClick={onNavigatePosition}>
                去录入持仓
              </Button>
            )}
          </div>
        )}
      </Empty>
    );
  }
  return null;
}

export function EvidenceSummary({
  candidate,
  trade,
  temporaryEvidence,
  onEdit,
}: {
  candidate: JournalReviewCandidate | null;
  trade: ReviewTrade;
  temporaryEvidence: ReviewEvidenceDraft;
  onEdit: () => void;
}) {
  const plan = candidate?.plan;
  const missing = candidate?.missingEvidence ?? [];
  return (
    <Card className="shadow-none">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>交易事实核对</CardTitle>
            <CardDescription>
              分析前先核对实际成交和已关联计划；补充字段只对本次复盘生效。
            </CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={onEdit}>
            <SlidersHorizontal data-icon="inline-start" aria-hidden="true" />
            补充证据
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="text-xs text-muted-foreground">实际入场</span>
            <p className="font-medium">{trade.entryPrice ?? '待补充'}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">实际退出</span>
            <p className="font-medium">{trade.exitPrice ?? trade.actualExit ?? '待补充'}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">成交数量</span>
            <p className="font-medium">{trade.quantity ?? '待补充'}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">已实现盈亏</span>
            <p className={cn('font-medium', marketToneClass(marketToneForValue(trade.pnl)))}>
              {trade.pnl}
            </p>
          </div>
        </div>
        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="mb-2 flex items-center gap-2">
            <Badge
              variant={candidate?.evidenceCompleteness === 'complete' ? 'secondary' : 'outline'}
            >
              {plan ? '已关联交易计划' : '未关联交易计划'}
            </Badge>
            {Object.keys(temporaryEvidence).length > 0 && (
              <Badge variant="outline">本次临时补充</Badge>
            )}
            <span className="text-xs text-muted-foreground">
              计划事实来源可追溯，未自动按日期猜测。
            </span>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <span>计划入场：{trade.plannedEntry ?? '待补充'}</span>
            <span>计划退出：{trade.plannedExit ?? '待补充'}</span>
            <span>计划止损：{trade.plannedStop ?? '待补充'}</span>
            <span>目标仓位：{trade.targetWeight ?? '待补充'}</span>
            <span>计划持有：{trade.plannedHoldingDays ?? '待补充'}</span>
            <span>最高仓位：{trade.peakWeight ?? '待补充'}</span>
          </div>
        </div>
        {missing.length > 0 && (
          <p className="text-sm text-muted-foreground">
            当前缺少：{missing.join('、')}。相关结论会标记为证据不足。
          </p>
        )}
      </CardContent>
    </Card>
  );
}

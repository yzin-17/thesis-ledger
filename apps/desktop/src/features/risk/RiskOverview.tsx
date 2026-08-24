import { Button } from '@/components/ui/button';
import { LoaderCircle, RefreshCw } from 'lucide-react';

import type { LoadState } from '../shared/types.js';
import type {
  PortfolioMode,
  RiskEventRecord,
  RiskRuleRecord,
  NotificationRecord,
} from './risk.types.js';
import { formatDateTime, riskModeLabel } from './risk.format.js';
import { RiskEventTable } from './RiskSections.js';

type SummaryTab = 'overview' | 'rules' | 'events' | 'notifications';

export const portfolioDataStatus = (state: LoadState) => {
  if (state === 'loading') return '加载中';
  if (state === 'error') return '读取失败';
  if (state === 'empty') return '空组合';
  if (state === 'stale') return '部分数据';
  return '可用';
};

export const isPortfolioScanReady = (state: LoadState) => state === 'ready' || state === 'stale';

export function RiskOverview({
  mode,
  portfolioValueAt,
  portfolioState,
  loadState,
  rules,
  events,
  deliveries,
  lastUpdatedAt,
  scanning,
  onScan,
  onRefresh,
  onSelectTab,
}: {
  mode: PortfolioMode;
  portfolioValueAt: string | null;
  portfolioState: LoadState;
  loadState: LoadState;
  rules: RiskRuleRecord[];
  events: RiskEventRecord[];
  deliveries: NotificationRecord[];
  lastUpdatedAt: string | null;
  scanning: boolean;
  onScan: () => void;
  onRefresh: () => void;
  onSelectTab: (tab: SummaryTab, filter?: string) => void;
}) {
  const enabledRules = rules.filter((rule) => rule.enabled).length;
  const criticalEvents = events.filter((event) => event.severity === 'critical').length;
  const failedNotifications = deliveries.filter((delivery) => delivery.status === 'failed').length;
  const scanReady = isPortfolioScanReady(portfolioState);
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="m-0 text-lg font-semibold">监控总览</h2>
            <p className="mt-1 mb-0 text-sm text-muted-foreground">
              当前显示 {riskModeLabel(mode)}，规则配置对两种模式共用。
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span>组合数据：{portfolioDataStatus(portfolioState)}</span>
          <span>数据时点：{formatDateTime(portfolioValueAt)}</span>
          <span>风险数据更新：{formatDateTime(lastUpdatedAt)}</span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={!scanReady || scanning}
            onClick={onScan}
            aria-busy={scanning}
          >
            {scanning && (
              <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
            )}
            {scanning ? '执行中…' : '立即执行风险规则'}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="secondary"
            disabled={scanning}
            onClick={onRefresh}
          >
            <RefreshCw data-icon="inline-start" aria-hidden="true" />
            获取最新风险结果
          </Button>
          {portfolioState === 'loading' && (
            <span className="text-xs text-muted-foreground">组合数据准备好后才能扫描。</span>
          )}
          {portfolioState === 'empty' && (
            <span className="text-xs text-muted-foreground">
              当前组合暂无持仓，添加持仓后才能扫描。
            </span>
          )}
          {portfolioState === 'error' && (
            <span className="text-xs text-muted-foreground">组合数据读取失败，暂不能扫描。</span>
          )}
        </div>
      </section>

      <section className="metrics" aria-label="风险关键指标">
        <SummaryMetric label="启用规则" value={enabledRules} onClick={() => onSelectTab('rules')} />
        <SummaryMetric
          label="严重事件"
          value={criticalEvents}
          {...(criticalEvents > 0 ? { tone: 'negative' as const } : {})}
          onClick={() => onSelectTab('events', 'critical')}
        />
        <SummaryMetric
          label="通知失败"
          value={failedNotifications}
          {...(failedNotifications > 0 ? { tone: 'negative' as const } : {})}
          onClick={() => onSelectTab('notifications', 'failed')}
        />
      </section>

      <RiskEventTable
        loadState={loadState}
        events={events}
        limit={4}
        title="最近风险事件"
        description="显示当前模式最近写入的事件，完整记录可在“事件”页签查看。"
        headerAction={
          <Button
            type="button"
            variant="link"
            size="sm"
            className="text-button"
            onClick={() => onSelectTab('events')}
          >
            查看全部
          </Button>
        }
      />
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  tone?: 'negative';
  onClick: () => void;
}) {
  return (
    <Button type="button" variant="metric" tone={tone} onClick={onClick}>
      <p>{label}</p>
      <strong>{value}</strong>
    </Button>
  );
}

import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { LoaderCircle } from 'lucide-react';

import type { LoadState } from '../shared/types.js';
import type {
  RiskEventRecord,
  RiskRuleRecord,
  NotificationRecord,
} from './risk.types.js';
import { formatDateTime } from './risk.format.js';
import { RiskMonitoringSchedule } from './RiskMonitoringSchedule.js';
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
  eventsRefreshing = false,
  portfolioValueAt,
  portfolioState,
  loadState,
  rulesState,
  notificationsState,
  rules,
  events,
  deliveries,
  lastUpdatedAt,
  scanning,
  scanDisabled = false,
  onScan,
  onSelectTab,
  onRetryEvents,
}: {
  eventsRefreshing?: boolean;
  portfolioValueAt: string | null;
  portfolioState: LoadState;
  loadState: LoadState;
  rulesState: LoadState;
  notificationsState: LoadState;
  rules: RiskRuleRecord[];
  events: RiskEventRecord[];
  deliveries: NotificationRecord[];
  lastUpdatedAt: string | null;
  scanning: boolean;
  scanDisabled?: boolean;
  onScan: () => void;
  onSelectTab: (tab: SummaryTab, filter?: string) => void;
  onRetryEvents?: (() => void) | undefined;
}) {
  const enabledRules = rules.filter((rule) => rule.enabled && !rule.archivedAt).length;
  const criticalEvents = events.filter((event) => event.severity === 'critical').length;
  const failedNotifications = deliveries.filter((delivery) => delivery.status === 'failed').length;
  const scanReady = isPortfolioScanReady(portfolioState);
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <h2 className="m-0 text-xl font-semibold">监控总览</h2>
        <RiskMonitoringSchedule
          enabledRules={rulesState === 'ready' || rulesState === 'empty' ? enabledRules : null}
          onOpenRules={() => onSelectTab('rules')}
        />
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">组合数据：{portfolioState === 'loading' ? <Spinner aria-label="正在读取组合数据" /> : portfolioDataStatus(portfolioState)}</span>
          <span>估值计算时间：{formatDateTime(portfolioValueAt)}</span>
          <span>风险数据更新：{formatDateTime(lastUpdatedAt)}</span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={!scanReady || scanning || scanDisabled}
            onClick={onScan}
            aria-busy={scanning}
          >
            {scanning && (
              <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
            )}
            {scanning ? '执行中…' : '立即执行风险规则'}
          </Button>
          {/* 全局刷新在页面顶栏，这里不再重复放置刷新按钮 */}
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

      <section className="grid grid-cols-3 gap-3" aria-label="风险关键指标">
        <SummaryMetric label="启用规则" value={enabledRules} state={rulesState} onClick={() => onSelectTab('rules')} />
        <SummaryMetric
          label="严重事件"
          value={criticalEvents}
          state={loadState}
          {...(criticalEvents > 0 ? { tone: 'negative' as const } : {})}
          onClick={() => onSelectTab('events', 'critical')}
        />
        <SummaryMetric
          label="通知失败"
          value={failedNotifications}
          state={notificationsState}
          {...(failedNotifications > 0 ? { tone: 'negative' as const } : {})}
          onClick={() => onSelectTab('notifications', 'failed')}
        />
      </section>

      <RiskEventTable
        refreshing={eventsRefreshing}
        loadState={loadState}
        onRetry={onRetryEvents}
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
  state,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  state: LoadState;
  tone?: 'negative';
  onClick: () => void;
}) {
  let valueLabel: number | string = value;
  let statusLabel: string | null = null;
  const unavailable = state === 'loading' || state === 'error';
  if (state === 'loading') {
    valueLabel = '—';
    statusLabel = '加载中';
  } else if (state === 'error') {
    valueLabel = '—';
    statusLabel = '读取失败';
  } else if (state === 'stale') {
    statusLabel = '旧数据，刷新失败';
  }
  return (
    <Button type="button" variant="metric" tone={tone} onClick={onClick} disabled={unavailable}>
      <p className="m-0 text-xs text-muted-foreground">{label}</p>
      <strong className="text-2xl font-semibold break-words tabular-nums">{valueLabel}</strong>
      {statusLabel && <span className="text-xs text-muted-foreground">{state === 'loading' ? <Spinner aria-label={statusLabel} /> : statusLabel}</span>}
    </Button>
  );
}

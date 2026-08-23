import { useEffect, useState, type FormEvent } from 'react';
import { useToastManager } from '@/components/ui/toast';

import type { Account } from '../portfolio/portfolio.types.js';
import { DataStateBanner } from '../shared/DesktopPrimitives.js';
import { resolveLoadState } from '../shared/loadState.js';
import { PortfolioModeNote, PortfolioModeSwitch } from '../shared/PortfolioModeSwitch.js';
import { useSavePerformanceTargetsMutation } from './performance.mutations.js';
import { usePerformanceQueries } from './performance.queries.js';
import type {
  PerformanceAllocationRecord,
  RebalanceGapRecord,
  SnapshotRecord,
  PortfolioMode,
} from './performance.types.js';
import {
  PerformanceAllocationTable,
  PerformanceMetrics,
  PerformanceAccountSelector,
  PerformanceRebalanceTable,
  PerformanceSnapshotTable,
  PerformanceTargetForm,
} from './PerformanceSections.js';

export function PerformanceDashboard({
  accounts,
  mode,
  onModeChange,
}: {
  accounts: Account[];
  mode: PortfolioMode;
  onModeChange: (mode: PortfolioMode) => void;
}) {
  const [accountId, setAccountId] = useState('');
  const [targetText, setTargetText] = useState('{"股票":0.6,"ETF":0.4}');
  const [savingTargets, setSavingTargets] = useState(false);
  const toastManager = useToastManager();
  const performanceQueries = usePerformanceQueries(mode, accountId);
  const saveTargetsMutation = useSavePerformanceTargetsMutation();
  const snapshots: SnapshotRecord[] = performanceQueries.history.data ?? [];
  const summary = performanceQueries.summary.data ?? null;
  const allocationRows: PerformanceAllocationRecord[] =
    performanceQueries.allocation.data?.allocation ?? [];
  const rebalanceRows: RebalanceGapRecord[] = performanceQueries.allocation.data?.rebalance ?? [];
  const hasPerformanceData = Object.values(performanceQueries).some(
    (query) => query.data !== undefined,
  );
  const loadState = resolveLoadState(
    Object.values(performanceQueries),
    hasPerformanceData,
    hasPerformanceData && snapshots.length === 0,
  );
  useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);
  }, [accountId, accounts]);
  const load = async () => {
    await Promise.all([performanceQueries.layers.refetch(), performanceQueries.targets.refetch()]);
    await Promise.all([performanceQueries.history.refetch(), performanceQueries.summary.refetch()]);
  };
  useEffect(() => {
    const loadedTargets = performanceQueries.targets.data?.targets ?? {};
    if (Object.keys(loadedTargets).length > 0) setTargetText(JSON.stringify(loadedTargets));
  }, [performanceQueries.targets.data]);
  const saveTargets = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingTargets) return;
    setSavingTargets(true);
    let targets: Record<string, number>;
    try {
      const parsed: unknown = JSON.parse(targetText);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        throw new Error('targets');
      targets = parsed as Record<string, number>;
    } catch {
      toastManager.add({
        title: '目标配置保存失败',
        description: '目标配置必须是 JSON 对象。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
      setSavingTargets(false);
      return;
    }
    try {
      await saveTargetsMutation.mutateAsync({
        scope: accountId ? 'account' : 'portfolio',
        ...(accountId ? { accountId } : {}),
        targets,
      });
      toastManager.add({
        title: '目标配置已保存',
        description: '已生成新版本。',
        type: 'success',
        timeout: 2800,
      });
      await load();
    } catch {
      toastManager.add({
        title: '目标配置保存失败',
        description: '目标权重必须合计 100%。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setSavingTargets(false);
    }
  };
  const latest = snapshots.at(-1);
  return (
    <section className="module-page">
      <header className="page-header">
        <div>
          <p className="kicker">Performance</p>
          <h1>收益分析</h1>
          <p className="page-description">
            所有收益指标从 Ledger 与带数据质量标记的 Portfolio Snapshot
            计算；指标仅解释历史，不自动下单。
          </p>
        </div>
        <div className="page-header-actions">
          <PortfolioModeSwitch
            mode={mode}
            onModeChange={onModeChange}
            ariaLabel="收益范围"
          />
        </div>
      </header>
      {mode === 'shadow' ? (
        <PortfolioModeNote>当前收益只计算模拟账户，结果仅用于研究。</PortfolioModeNote>
      ) : null}
      <DataStateBanner state={loadState} onRetry={() => void load()} />
      <PerformanceAccountSelector
        accounts={accounts}
        accountId={accountId}
        onAccountChange={setAccountId}
      />
      <PerformanceMetrics latest={latest} summary={summary} />
      <PerformanceSnapshotTable loadState={loadState} snapshots={snapshots} />
      <PerformanceAllocationTable loadState={loadState} rows={allocationRows} />
      <PerformanceRebalanceTable loadState={loadState} rows={rebalanceRows} />
      <PerformanceTargetForm
        targetText={targetText}
        saving={savingTargets}
        onChange={setTargetText}
        onSubmit={(event) => void saveTargets(event)}
      />
    </section>
  );
}

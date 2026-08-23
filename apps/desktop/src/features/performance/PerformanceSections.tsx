import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoaderCircle } from 'lucide-react';

import type { Account } from '../portfolio/portfolio.types.js';
import { money, isDataLoaded } from '../shared/display.js';
import { EmptyTableRow } from '../shared/EmptyStates.js';
import { Metric } from '../shared/DesktopPrimitives.js';
import type {
  PerformanceAllocationRecord,
  RebalanceGapRecord,
  SnapshotRecord,
  PerformanceSummary,
} from './performance.types.js';

export function PerformanceAccountSelector({
  accounts,
  accountId,
  onAccountChange,
}: {
  accounts: Account[];
  accountId: string;
  onAccountChange: (accountId: string) => void;
}) {
  const selectedAccount = accounts.find((account) => account.id === accountId);
  return (
    <>
      <label className="inline-control">
        账户
        <Select value={accountId || null} onValueChange={(value) => onAccountChange(value ?? '')}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="全组合">{selectedAccount?.name ?? '全组合'}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </label>
    </>
  );
}

export function PerformanceMetrics({
  latest,
  summary,
}: {
  latest: SnapshotRecord | undefined;
  summary: PerformanceSummary | null;
}) {
  const xirrValue =
    summary === null || summary.xirr === null ? '不可计算' : `${(summary.xirr * 100).toFixed(2)}%`;
  return (
    <div className="metrics">
      <Metric
        label="最新总资产"
        value={
          latest ? money.format(Number(latest.marketValue) + Number(latest.cashValue)) : '暂无'
        }
        detail="Snapshot 市值 + 现金"
      />
      <Metric
        label="TTWROR"
        value={summary ? `${(summary.ttwror * 100).toFixed(2)}%` : '暂无'}
        detail="时间加权收益，不混入外部现金流"
      />
      <Metric label="XIRR" value={xirrValue} detail="现金流可解时的年化收益" />
    </div>
  );
}

export function PerformanceSnapshotTable({
  loadState,
  snapshots,
}: {
  loadState: 'loading' | 'error' | 'stale' | 'empty' | 'ready';
  snapshots: SnapshotRecord[];
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>历史 Snapshot</h2>
        <p>市值、成本、现金和数据时点可回放。</p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>市值</th>
              <th>成本</th>
              <th>现金</th>
            </tr>
          </thead>
          <tbody>
            {isDataLoaded(loadState) && snapshots.length === 0 ? (
              <EmptyTableRow colSpan={4} />
            ) : (
              snapshots.map((snapshot) => (
                <tr key={snapshot.id}>
                  <td>{new Date(snapshot.capturedAt).toLocaleString('zh-CN')}</td>
                  <td>{money.format(snapshot.marketValue)}</td>
                  <td>{money.format(snapshot.costValue)}</td>
                  <td>{money.format(snapshot.cashValue)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function PerformanceAllocationTable({
  loadState,
  rows,
}: {
  loadState: 'loading' | 'error' | 'stale' | 'empty' | 'ready';
  rows: PerformanceAllocationRecord[];
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>资产配置</h2>
        <p>按资产类型汇总可用市值；缺失行情不会伪装成零值。</p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>分类</th>
              <th>市值</th>
              <th>当前权重</th>
            </tr>
          </thead>
          <tbody>
            {isDataLoaded(loadState) && rows.length === 0 ? (
              <EmptyTableRow colSpan={3} />
            ) : (
              rows.map((row) => (
                <tr key={row.category}>
                  <td>{row.category}</td>
                  <td>{money.format(row.value)}</td>
                  <td>{(row.weight * 100).toFixed(2)}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const rebalanceDirectionLabel = (direction: RebalanceGapRecord['direction']) => {
  if (direction === 'increase') return '增配';
  if (direction === 'decrease') return '减配';
  return '平衡';
};

export function PerformanceRebalanceTable({
  loadState,
  rows,
}: {
  loadState: 'loading' | 'error' | 'stale' | 'empty' | 'ready';
  rows: RebalanceGapRecord[];
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>再平衡缺口</h2>
        <p>仅提供增配/减配建议，不会自动下单。</p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>分类</th>
              <th>当前 / 目标</th>
              <th>缺口金额</th>
              <th>建议</th>
            </tr>
          </thead>
          <tbody>
            {isDataLoaded(loadState) && rows.length === 0 ? (
              <EmptyTableRow colSpan={4} />
            ) : (
              rows.map((row) => (
                <tr key={row.category}>
                  <td>{row.category}</td>
                  <td>
                    {(row.currentWeight * 100).toFixed(2)}% / {(row.targetWeight * 100).toFixed(2)}%
                  </td>
                  <td>{money.format(Math.abs(row.amountGap))}</td>
                  <td>{rebalanceDirectionLabel(row.direction)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function PerformanceTargetForm({
  targetText,
  saving,
  onChange,
  onSubmit,
}: {
  targetText: string;
  saving: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="form-card" onSubmit={onSubmit}>
      <h3>目标配置</h3>
      <label>
        分类权重 JSON
        <Input
          value={targetText}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby="target-help"
        />
      </label>
      <small id="target-help">例如 {`{"股票":0.6,"ETF":0.4}`}，总和必须为 1。</small>
      <Button disabled={saving} type="submit" variant="default">
        {saving && (
          <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
        )}
        {saving ? '保存中…' : '保存目标'}
      </Button>
    </form>
  );
}

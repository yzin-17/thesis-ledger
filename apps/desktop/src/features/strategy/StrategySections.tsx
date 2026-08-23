import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LoaderCircle } from 'lucide-react';

import { money, displayValue, isDataLoaded } from '../shared/display.js';
import { EmptyListState, EmptyTableRow } from '../shared/EmptyStates.js';
import { Metric } from '../shared/DesktopPrimitives.js';
import type { BacktestJob, StrategyRecord } from './strategy.types.js';

export function StrategyEditor({
  name,
  schemaText,
  busy,
  onNameChange,
  onSchemaChange,
  onSubmit,
}: {
  name: string;
  schemaText: string;
  busy: boolean;
  onNameChange: (value: string) => void;
  onSchemaChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="form-card" onSubmit={onSubmit}>
      <h3>新建策略</h3>
      <label>
        名称
        <Input value={name} onChange={(event) => onNameChange(event.target.value)} required />
      </label>
      <label>
        Strategy Schema JSON
        <Textarea
          value={schemaText}
          onChange={(event) => onSchemaChange(event.target.value)}
          rows={12}
        />
      </label>
      <Button disabled={busy} type="submit" variant="default">
        {busy && (
          <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
        )}
        {busy ? '保存中…' : '保存新版本'}
      </Button>
    </form>
  );
}

export function StrategyVersions({
  strategies,
  loadState,
  busyAction,
  onQueue,
}: {
  strategies: StrategyRecord[];
  loadState: 'loading' | 'error' | 'stale' | 'empty' | 'ready';
  busyAction: string | null;
  onQueue: (strategy: StrategyRecord) => void;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>策略版本</h2>
      </div>
      <div className="edit-list">
        {isDataLoaded(loadState) && strategies.length === 0 ? (
          <EmptyListState className="justify-center border-b-0" />
        ) : (
          strategies.map((strategy) => (
            <div key={strategy.id}>
              <span>
                <strong>{strategy.name}</strong>
                <small>
                  {strategy.versions.map((version) => `v${version.version}`).join(' · ')}
                </small>
              </span>
              <Button
                className="text-button"
                size="sm"
                variant="link"
                disabled={busyAction !== null}
                aria-busy={busyAction === `queue:${strategy.id}`}
                onClick={() => onQueue(strategy)}
              >
                {busyAction === `queue:${strategy.id}` && (
                  <LoaderCircle
                    data-icon="inline-start"
                    className="animate-spin"
                    aria-hidden="true"
                  />
                )}
                {busyAction === `queue:${strategy.id}` ? '排队中…' : '排队回测'}
              </Button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function StrategyJobs({
  jobs,
  loadState,
  busyAction,
  selectedJobId,
  onSelect,
  onRun,
  onCancel,
}: {
  jobs: BacktestJob[];
  loadState: 'loading' | 'error' | 'stale' | 'empty' | 'ready';
  busyAction: string | null;
  selectedJobId: string | null;
  onSelect: (jobId: string) => void;
  onRun: (jobId: string) => void;
  onCancel: (jobId: string) => void;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>回测任务</h2>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>任务</th>
              <th>状态</th>
              <th>进度</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {isDataLoaded(loadState) && jobs.length === 0 ? (
              <EmptyTableRow colSpan={4} />
            ) : (
              jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <Button
                      className="text-button"
                      size="sm"
                      variant="link"
                      aria-pressed={selectedJobId === job.id}
                      onClick={() => onSelect(job.id)}
                    >
                      {job.id.slice(0, 8)}
                    </Button>
                    <span>{job.strategyVersionId.slice(0, 8)}</span>
                  </td>
                  <td>{job.status}</td>
                  <td>{job.progress}%</td>
                  <td>
                    {job.status === 'queued' && (
                      <Button
                        className="text-button"
                        size="sm"
                        variant="link"
                        disabled={busyAction !== null}
                        aria-busy={busyAction === `run:${job.id}`}
                        onClick={() => onRun(job.id)}
                      >
                        {busyAction === `run:${job.id}` && (
                          <LoaderCircle
                            data-icon="inline-start"
                            className="animate-spin"
                            aria-hidden="true"
                          />
                        )}
                        {busyAction === `run:${job.id}` ? '运行中…' : '运行'}
                      </Button>
                    )}
                    {!['succeeded', 'failed', 'cancelled'].includes(job.status) && (
                      <Button
                        className="text-button danger"
                        size="sm"
                        variant="destructive"
                        disabled={busyAction !== null}
                        aria-busy={busyAction === `cancel:${job.id}`}
                        onClick={() => onCancel(job.id)}
                      >
                        {busyAction === `cancel:${job.id}` && (
                          <LoaderCircle
                            data-icon="inline-start"
                            className="animate-spin"
                            aria-hidden="true"
                          />
                        )}
                        {busyAction === `cancel:${job.id}` ? '取消中…' : '取消'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const resultRecord = (job: BacktestJob | null) => {
  if (!job?.result || typeof job.result !== 'object') return null;
  return job.result as Record<string, unknown>;
};

function StrategyMetricGrid({
  result,
  metrics,
}: {
  result: Record<string, unknown>;
  metrics: Record<string, unknown> | null;
}) {
  const metricValue = (key: string) => {
    const value = metrics?.[key];
    return typeof value === 'number' ? `${(value * 100).toFixed(2)}%` : '暂无';
  };
  return (
    <div className="metrics">
      <Metric
        label="最终资产"
        value={typeof result.finalValue === 'number' ? money.format(result.finalValue) : '暂无'}
      />
      <Metric label="累计收益" value={metricValue('cumulativeReturn')} />
      <Metric label="最大回撤" value={metricValue('maxDrawdown')} tone="negative" />
      <Metric label="交易胜率" value={metricValue('tradeWinRate')} />
    </div>
  );
}

export function StrategyResult({ job }: { job: BacktestJob | null }) {
  if (!job) return null;
  const result = resultRecord(job);
  const metrics =
    result?.metrics && typeof result.metrics === 'object'
      ? (result.metrics as Record<string, unknown>)
      : null;
  const equityCurve = Array.isArray(result?.equityCurve)
    ? (result.equityCurve as Array<{ date: string; value: number }>)
    : [];
  const trades = Array.isArray(result?.trades)
    ? (result.trades as Array<Record<string, unknown>>)
    : [];
  return (
    <section className="panel" aria-live="polite">
      <div className="panel-heading">
        <h2>回测结果 · {job.id.slice(0, 8)}</h2>
        <p>权益曲线、回撤和交易明细来自已保存的可复现结果。</p>
      </div>
      {!result ? (
        <p className="empty-state">任务尚未完成，运行后可查看结果。</p>
      ) : (
        <>
          <StrategyMetricGrid result={result} metrics={metrics} />
          <div className="module-grid">
            <div>
              <span>权益曲线</span>
              <strong>{equityCurve.length} 个数据点</strong>
            </div>
            <div>
              <span>交易明细</span>
              <strong>{trades.length} 笔</strong>
            </div>
            <div>
              <span>引擎</span>
              <strong>{displayValue(result.engineVersion ?? '未知')}</strong>
            </div>
            <div>
              <span>数据时点</span>
              <strong>{displayValue(result.dataAsOf ?? '未知')}</strong>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>权益曲线日期</th>
                  <th>组合价值</th>
                </tr>
              </thead>
              <tbody>
                {equityCurve.length === 0 ? (
                  <EmptyTableRow colSpan={2} />
                ) : (
                  equityCurve.slice(-20).map((point) => (
                    <tr key={point.date}>
                      <td>{point.date}</td>
                      <td>{money.format(point.value)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>日期</th>
                  <th>方向</th>
                  <th>数量</th>
                  <th>价格</th>
                  <th>原因</th>
                </tr>
              </thead>
              <tbody>
                {trades.length === 0 ? (
                  <EmptyTableRow colSpan={5} />
                ) : (
                  trades.map((trade, index) => (
                    <tr key={`${displayValue(trade.date ?? '')}-${index}`}>
                      <td>{displayValue(trade.date ?? '—')}</td>
                      <td>{displayValue(trade.side ?? '—')}</td>
                      <td>{displayValue(trade.quantity ?? '—')}</td>
                      <td>{displayValue(trade.price ?? '—')}</td>
                      <td>{displayValue(trade.reason ?? '—')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

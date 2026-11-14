import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '../src/components/ui/button.js';
import { PerformanceSnapshotTable } from '../src/features/performance/PerformanceTrendSection.js';
import type {
  PerformanceSeriesInterval,
  PerformanceSeriesPoint,
  PerformanceSeriesRange,
  SnapshotRecord,
} from '../src/features/performance/performance.types.js';
import type { PnlChartPoint } from '../src/features/performance/performance-pnl-model.js';
import '../src/ui/styles.css';

const sparse: PerformanceSeriesPoint[] = [0, 1, 10, 24].map((hour, index) => ({
  at: new Date(Date.UTC(2026, 9, 2, 23) + hour * 3_600_000).toISOString(),
  value: 1000 + index * 100,
  currency: 'CNY',
  valuationBasis: index === 3 ? 'OFFICIAL' : 'ESTIMATED',
  disclosureCoverage: index === 1 ? 0.14 : 1,
  pricedCoverage: index === 1 ? 0.08 : 1,
  dataQuality: index === 1 ? 'LOW_COVERAGE' : 'COMPLETE',
  sourceSnapshotId: `fixture-${index}`,
}));
const dense: PerformanceSeriesPoint[] = Array.from({ length: 2000 }, (_, index) => ({
  ...sparse[0]!,
  at: new Date(Date.UTC(2026, 9, 2, 23) + index * 60_000).toISOString(),
  value: 1000 + index,
  sourceSnapshotId: null,
}));
const pnlPoints: PnlChartPoint[] = sparse.map((point, index) => ({
  at: point.at,
  value: index === 1 ? null : index * 10,
  realizedPnl: index * 10,
  unrealizedPnl: 0,
  current: index === 3,
  reason: index === 1 ? 'price_unavailable' : null,
}));
const currencySnapshots: SnapshotRecord[] = sparse.map((point, index) => ({
  id: 'currency-' + index,
  capturedAt: point.at,
  marketValue: point.value,
  costValue: 1000,
  cashValue: 0,
  partial: false,
  missingSymbols: [],
  currency: index < 2 ? 'CNY' : 'USD',
}));

function Fixture() {
  const [range, setRange] = useState<PerformanceSeriesRange>('1Y');
  const [interval, setInterval] = useState<PerformanceSeriesInterval>('1d');
  const [scenario, setScenario] = useState<'sparse' | 'dense' | 'single' | 'empty'>('sparse');
  const [pointerType, setPointerType] = useState('尚未交互');
  const [withPnl, setWithPnl] = useState(false);
  const [grouped, setGrouped] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  let points = sparse;
  if (scenario === 'dense') points = dense;
  else if (scenario === 'single') points = sparse.slice(0, 1);
  else if (scenario === 'empty') points = [];
  const matrix: Record<PerformanceSeriesRange, PerformanceSeriesInterval[]> = {
    '1D': ['1min', '1h'],
    '5D': ['1min', '1h', '1d'],
    '1M': ['1h', '1d', '1w'],
    '3M': ['1h', '1d', '1w', '1mo'],
    YTD: ['1d', '1w', '1mo'],
    '1Y': ['1d', '1w', '1mo'],
    '5Y': ['1w', '1mo', '1y'],
    ALL: ['1mo', '1y'],
  };
  return (
    <main
      className="flex flex-col gap-4 p-4"
      onPointerDownCapture={(event) => setPointerType(event.pointerType)}
    >
      <h1>组合走势交互验收</h1>
      <p>本页为固定输入，验证真实组件交互；不请求来源，不生成业务历史。</p>
      <p>最近指针类型：{pointerType}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setScenario('sparse')}>稀疏跨日点</Button>
        <Button onClick={() => setScenario('dense')}>2000 个分钟点</Button>
        <Button onClick={() => setScenario('single')}>单点</Button>
        <Button onClick={() => setScenario('empty')}>空数据</Button>
        <Button onClick={() => setWithPnl(!withPnl)}>切换盈亏</Button>
        <Button onClick={() => setGrouped(!grouped)}>切换分币种</Button>
        <Button onClick={() => setFailed(!failed)}>切换读取失败</Button>
        <Button onClick={() => setRefreshing(!refreshing)}>切换刷新</Button>
      </div>
      <PerformanceSnapshotTable
        loadState={trendFixtureLoadState(failed, points.length)}
        snapshots={grouped ? currencySnapshots : []}
        groupedByCurrency={grouped}
        refreshing={refreshing}
        onRetry={() => setFailed(false)}
        {...(withPnl
          ? {
              pnl: {
                points: pnlPoints,
                currency: 'CNY' as const,
                loading: false,
                error: failed,
                historyEmpty: false,
                truncated: true,
                currentUnavailable: false,
                onRetry: () => setFailed(false),
              },
            }
          : {})}
        range={range}
        interval={interval}
        onRangeChange={(nextRange, nextInterval) => {
          setRange(nextRange);
          setInterval(nextInterval);
        }}
        onIntervalChange={setInterval}
        series={{
          range,
          interval,
          currency: 'CNY',
          availableIntervals: matrix[range],
          defaultInterval: interval,
          dataQuality: 'LOW_COVERAGE',
          historyStart: points[0]?.at ?? null,
          points,
        }}
      />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);

function trendFixtureLoadState(failed: boolean, count: number) {
  if (failed) return 'stale';
  if (count > 0) return 'ready';
  return 'empty';
}

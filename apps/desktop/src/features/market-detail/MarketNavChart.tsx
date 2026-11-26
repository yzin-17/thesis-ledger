import { MarketChartFullscreen, useChartFullscreen } from './MarketChartFullscreen.js';
import { FundNavChartCanvas } from './FundNavChartCanvas.js';
import {
  MarketChartViewportController,
  type ChartViewAction,
  type ChartViewportSession,
} from './market-chart-viewport-controller.js';
export { navChartLayoutOptions } from './FundNavChartCanvas.js';
import { MarketChartToolbarGroup } from './MarketChartToolbar.js';
import { MarketChartViewActions } from './MarketChartViewActions.js';
import type { MarketDetailPosition } from './market-detail.types.js';
import { useFundNavReferences } from './useFundNavReferences.js';
import { FundNavReferenceControls } from './FundNavReferenceControls.js';
import { useFundNavCursor } from './useFundNavCursor.js';
import { type ChartRange } from './chart-date-range.js';
import { MarketChartRangeSelect } from './MarketChartRangeSelect.js';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Currency, FundNavHistory } from '@thesis-ledger/schemas';
import { MarketNavChartReadout } from './MarketNavChartReadout.js';
import { MarketChartAttribution } from './MarketChartAttribution.js';
import type { PnlChartPoint } from '../performance/performance-pnl-model.js';
import { navPnlData } from './fund-nav-pnl-series.js';
import { navViewportChange } from './nav-chart-viewport.js';
import { FundIntradayChart } from './FundIntradayChart.js';
import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import type { FundNavTrades } from './useFundNavTrades.js';
import { FundNavTradeDetails } from './FundNavTradeDetails.js';
import type { FundNavTradeGroup } from './fund-nav-trade-model.js';

const emptyTradeGroups: FundNavTradeGroup[] = [];

type FundNavHistoryChartProps = {
  history: FundNavHistory;
  position?: MarketDetailPosition | undefined;
  pnl?: { points: PnlChartPoint[]; currency: Currency; notice?: ReactNode; loading?: boolean };
  trades?: FundNavTrades;
  range?: ChartRange;
  onRangeChange?: (range: ChartRange) => void;
  historyLoading?: boolean;
  historyNotice?: ReactNode;
};

export function FundNavHistoryChart(props: FundNavHistoryChartProps) {
  const [localRange, setLocalRange] = useState<ChartRange>(30);
  const range = props.range ?? localRange;
  const onRangeChange = props.onRangeChange ?? setLocalRange;
  const symbol = props.history.at(-1)?.symbol;
  const controls = (
    <MarketChartToolbarGroup label="区间">
      <MarketChartRangeSelect
        value={range}
        onValueChange={onRangeChange}
        symbol={symbol}
        anchorDate={props.history.at(-1)?.navDate.slice(0, 10)}
      />
    </MarketChartToolbarGroup>
  );
  if (range === 1 && symbol)
    return (
      <FundIntradayChart
        key={symbol}
        symbol={symbol}
        onHistory={() => onRangeChange(30)}
        rangeControls={controls}
      />
    );
  return (
    <HistoricalFundNavChart
      {...props}
      position={props.position ?? props.trades?.position}
      range={range}
      onRangeChange={onRangeChange}
    />
  );
}

function HistoricalFundNavChart({
  history: sourceHistory,
  position,
  pnl,
  trades,
  range = 30,
  onRangeChange,
  historyLoading,
  historyNotice,
}: FundNavHistoryChartProps) {
  const {
    onChartClick,
    setViewport,
    history,
    pnlData,
    fullscreen,
    session,
    viewAction,
    setViewAction,
    references,
    setHovered,
    locked,
    setLocked,
    selectTrade,
    resetRevision,
    setResetRevision,
    focusRevision,
    setFocusRevision,
    viewportChange,
    selectedDate,
    selected,
    selectedPnl,
    selectVisibleTrade,
    tradeScope,
    tradeSelection,
  } = useHistoricalFundNavChart({ history: sourceHistory, position, pnl, trades });
  const { panel } = renderHistoricalFundNavPanel(
    {
      onChartClick,
      setViewport,
      history,
      pnlData,
      fullscreen,
      session,
      viewAction,
      setViewAction,
      references,
      setHovered,
      locked,
      setLocked,
      selectTrade,
      resetRevision,
      setResetRevision,
      focusRevision,
      setFocusRevision,
      viewportChange,
      selectedDate,
      selected,
      selectedPnl,
      selectVisibleTrade,
      tradeScope,
      tradeSelection,
    },
    { range, onRangeChange, historyLoading, historyNotice, pnl, trades },
  );
  return (
    <MarketChartFullscreen
      expanded={fullscreen.expanded}
      onOpenChange={fullscreen.setExpanded}
      title="基金净值历史"
    >
      {panel}
    </MarketChartFullscreen>
  );
}

function useHistoricalFundNavChart({
  history: sourceHistory,
  position,
  pnl,
  trades,
}: {
  history: FundNavHistory;
  position: FundNavHistoryChartProps['position'];
  pnl: FundNavHistoryChartProps['pnl'];
  trades: FundNavHistoryChartProps['trades'];
}) {
  const history = useMemo(
    () => sourceHistory.map((point) => ({ ...point, navDate: point.navDate.slice(0, 10) })),
    [sourceHistory],
  );
  const pnlData = useMemo(() => navPnlData(pnl?.points ?? []), [pnl?.points]);
  const fullscreen = useChartFullscreen();
  const session = useRef<ChartViewportSession>({
    controller: new MarketChartViewportController(),
    snapshot: null,
  });
  const [viewAction, setViewAction] = useState<ChartViewAction>();
  const references = useFundNavReferences(history, position);
  const { hovered, locked, setHovered, setLocked, onChartClick, canSelectTrade } =
    useFundNavCursor(references);

  const [resetRevision, setResetRevision] = useState(0);
  const [focusRevision, setFocusRevision] = useState(0);
  const [viewport, setViewport] = useState<{ from: string; to: string } | null>(null);
  const [tradeSelection, setTradeSelection] = useState<{
    scope: string | undefined;
    id: string | null;
  } | null>(null);
  const tradeScope = trades?.scope;
  const selectTrade = useCallback(
    (id: string | null) => {
      if (id !== null) {
        setLocked(null);
        setHovered(null);
      }
      setTradeSelection({ scope: tradeScope, id });
    },
    [tradeScope],
  );
  const viewportChange = useMemo(() => navViewportChange(history, viewport), [history, viewport]);
  const selectedDate = locked ?? hovered;
  const selected = selectedDate
    ? history.find((point) => point.navDate === selectedDate)
    : history.at(-1);
  const selectedPnl = selectedDate
    ? pnlData.dated.find(([date]) => date === selectedDate)
    : pnlData.dated.at(-1);

  const selectVisibleTrade = useCallback(
    (id: string) => {
      if (canSelectTrade()) selectTrade(id);
    },
    [selectTrade, canSelectTrade],
  );
  return {
    onChartClick,
    setViewport,
    history,
    pnlData,
    fullscreen,
    session,
    viewAction,
    setViewAction,
    references,
    setHovered,
    locked,
    setLocked,
    selectTrade,
    resetRevision,
    setResetRevision,
    focusRevision,
    setFocusRevision,
    viewportChange,
    selectedDate,
    selected,
    selectedPnl,
    selectVisibleTrade,
    tradeScope,
    tradeSelection,
  };
}

function renderHistoricalFundNavPanel(
  control: ReturnType<typeof useHistoricalFundNavChart>,
  options: {
    range: ChartRange;
    onRangeChange: FundNavHistoryChartProps['onRangeChange'];
    historyLoading: FundNavHistoryChartProps['historyLoading'];
    historyNotice: ReactNode;
    pnl: FundNavHistoryChartProps['pnl'];
    trades: FundNavHistoryChartProps['trades'];
  },
) {
  const {
    onChartClick,
    setViewport,
    history,
    pnlData,
    fullscreen,
    session,
    viewAction,
    setViewAction,
    references,
    setHovered,
    locked,
    setLocked,
    selectTrade,
    resetRevision,
    setResetRevision,
    focusRevision,
    setFocusRevision,
    viewportChange,
    selectedDate,
    selected,
    selectVisibleTrade,
  } = control;
  const { range, onRangeChange, historyNotice, pnl, trades } = options;

  const panelState = historicalNavPanelState(control, options);
  const panel = (
    <div className="grid min-w-0 gap-2 rounded-lg bg-muted/30 p-3" data-market-nav-chart>
      <div
        className="flex flex-wrap items-start gap-x-4 gap-y-2"
        role="toolbar"
        aria-label="净值范围"
      >
        <MarketChartToolbarGroup label="区间">
          <MarketChartRangeSelect
            value={range}
            onValueChange={(next) => {
              onRangeChange?.(next);
              setLocked(null);
              setHovered(null);
            }}
            symbol={history.at(-1)?.symbol}
            anchorDate={history.at(-1)?.navDate}
          />
        </MarketChartToolbarGroup>
        <MarketChartToolbarGroup label="视图">
          <MarketChartViewActions
            expanded={fullscreen.expanded}
            fullscreenTrigger={fullscreen.trigger}
            onToggleExpanded={() => fullscreen.setExpanded((value) => !value)}
            onNavigate={(type) =>
              setViewAction((current) => ({ type, revision: (current?.revision ?? 0) + 1 }))
            }
            onLatest={() => {
              setLocked(null);
              setHovered(null);
              setFocusRevision((value) => value + 1);
            }}
            onReset={() => {
              onRangeChange?.(30);
              setLocked(null);
              setHovered(null);
              setResetRevision((value) => value + 1);
            }}
          />
        </MarketChartToolbarGroup>
      </div>
      {pnl ? (
        <div
          className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"
          aria-label="净值与累计盈亏图例"
        >
          <span>
            ┄ 累计盈亏（{pnl.currency}，左轴）
            {pnlData.dated.filter(([, point]) => point.value !== null).length === 1
              ? ' · 单点'
              : ''}
          </span>
          <span>━ 单位净值（右轴）</span>
        </div>
      ) : null}
      <FundNavReferenceControls
        references={references}
        onMeasure={() => {
          references.toggleMeasurement();
          setLocked(null);
          setHovered(null);
        }}
      />
      {historyNotice}
      {pnl?.notice}
      <div className="relative">
        <ListRefreshRegion refreshing={panelState.refreshing} label="正在读取净值图数据">
          <FundNavChartCanvas
            history={history}
            pnl={pnl}
            references={references}
            groups={panelState.groups}
            selectTrade={selectVisibleTrade}
            onHover={setHovered}
            onClick={onChartClick}
            onViewport={setViewport}
            controls={{ range, reset: resetRevision, focus: focusRevision }}
            viewAction={viewAction}
            session={session}
            expanded={fullscreen.expanded}
          />
        </ListRefreshRegion>
        {panelState.emptyRange && (
          <p
            className="pointer-events-none absolute inset-0 m-0 flex items-center justify-center bg-background/95 text-sm text-muted-foreground"
            role="status"
          >
            所选区间暂无净值数据。
          </p>
        )}
      </div>
      {trades && (
        <FundNavTradeDetails
          key={trades.scope}
          trades={trades}
          selectedId={panelState.selectedTradeId}
          onSelect={selectTrade}
        />
      )}
      <MarketNavChartReadout
        selectedDate={selectedDate}
        locked={locked !== null}
        selected={selected}
        viewportChange={viewportChange}
        pnl={panelState.pnlReadout}
      />
      <div className="text-xs text-muted-foreground">
        <MarketChartAttribution />
      </div>
    </div>
  );
  return { panel };
}

function historicalNavPanelState(
  control: ReturnType<typeof useHistoricalFundNavChart>,
  options: Parameters<typeof renderHistoricalFundNavPanel>[1],
) {
  const { history, tradeSelection, tradeScope, selectedPnl } = control;
  const { historyLoading, historyNotice, range, trades, pnl } = options;
  const refreshing = Boolean(trades?.loading || pnl?.loading || historyLoading);
  const groups = trades?.groups ?? emptyTradeGroups;
  const emptyRange =
    !historyLoading &&
    !historyNotice &&
    typeof range !== 'number' &&
    !history.some((point) => range.from <= point.navDate && point.navDate <= range.to);
  const selectedTradeId =
    tradeSelection?.scope === tradeScope ? (tradeSelection?.id ?? null) : null;
  const pnlReadout = pnl
    ? { currency: pnl.currency, value: selectedPnl?.[1].value ?? null, date: selectedPnl?.[0] }
    : undefined;
  return { refreshing, groups, emptyRange, selectedTradeId, pnlReadout };
}

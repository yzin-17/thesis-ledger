import type {
  IPrimitivePaneRenderer,
  ISeriesPrimitive,
  MouseEventParams,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';
import type { TradingOverlayModel } from './market-trading-overlay-model.js';
import { toChartTime } from './market-chart-time.js';

type Point = NonNullable<TradingOverlayModel['arenaMarkers']>[number];
type Arrow = {
  id: string;
  key: string;
  side: Point['side'];
  points: Point[];
  x: number;
  tip: number;
  tail: number;
  half: number;
  stemHalf: number;
  margin: number;
  label?: { left: number; right: number; top: number; bottom: number };
};
type Colors = {
  buy: string;
  sell: string;
  background: string;
  foreground: string;
  border: string;
  font: string;
};

/** 对齐当前 SeriesMarkers 的奇偶像素取整；描边内缩 1px，使外轮廓与真实成交等大。 */
function arenaArrowSize(barSpacing: number) {
  const spacing = Math.ceil(Math.max(12, Math.min(30, barSpacing)));
  const markerHeight = spacing - (spacing % 2 === 0 ? 2 : 1);
  const base = markerHeight / 2;
  return {
    half: (Math.max(markerHeight, 12) - 2) / 2 - 1,
    stemHalf: (base - (base % 2 === 0 ? 2 : 1)) / 2 - 1,
    margin: 3,
  };
}

function drawTooltip(
  context: CanvasRenderingContext2D,
  arrow: Arrow,
  width: number,
  height: number,
  colors: Colors,
) {
  const boxWidth = Math.min(360, width - 16);
  const lines: string[] = [];
  context.font = `12px ${colors.font}`;
  for (const point of arrow.points) {
    for (const text of [
      point.model,
      `${point.day} · 模拟${point.side === 'buy' ? '买入' : '卖出'} ${point.quantity} 股 × ${point.price}`,
    ]) {
      let line = '';
      for (const character of text) {
        if (line && context.measureText(line + character).width > boxWidth - 20) {
          lines.push(line);
          line = '';
        }
        line += character;
      }
      lines.push(line);
    }
  }
  const maxLines = Math.max(1, Math.floor((height - 28) / 17));
  const visible = lines.slice(0, maxLines);
  if (lines.length > maxLines) visible[visible.length - 1] = '更多成交可按模型筛选查看';
  const boxHeight = visible.length * 17 + 16;
  const left = Math.max(8, Math.min(arrow.x + 14, width - boxWidth - 8));
  const top = Math.max(6, Math.min(arrow.tip - boxHeight - 10, height - boxHeight - 6));
  context.setLineDash([]);
  context.fillStyle = colors.background;
  context.strokeStyle = colors.border;
  context.lineWidth = 1;
  context.beginPath();
  context.roundRect(left, top, boxWidth, boxHeight, 6);
  context.fill();
  context.stroke();
  context.fillStyle = colors.foreground;
  context.textBaseline = 'top';
  visible.forEach((line, index) => context.fillText(line, left + 10, top + 8 + index * 17));
}

/** 模拟成交与普通成交共享颜色；空心箭头按绘图桶合并，模型详情只在悬浮时显示。 */
export function createArenaMarkerPrimitive(
  points: readonly Point[],
  colors: Colors,
): ISeriesPrimitive<Time> {
  const groups = new Map<string, Pick<Arrow, 'id' | 'key' | 'side' | 'points'>>();
  for (const point of points) {
    const key = point.key ?? point.day,
      id = `arena:${key}:${point.side}`;
    const group = groups.get(id);
    if (group) group.points.push(point);
    else groups.set(id, { id, key, side: point.side, points: [point] });
  }
  let attached: SeriesAttachedParameter<Time> | undefined;
  let arrows: Arrow[] = [];
  let hovered: string | undefined;
  let fontSize = 12;
  const hit = (x: number, y: number) =>
    arrows.find((arrow) => {
      if (
        Math.abs(arrow.x - x) <= arrow.half + 5 &&
        y >= Math.min(arrow.tip, arrow.tail) - 5 &&
        y <= Math.max(arrow.tip, arrow.tail) + 5
      )
        return true;
      const label = arrow.label;
      return Boolean(
        label && x >= label.left && x <= label.right && y >= label.top && y <= label.bottom,
      );
    });
  const move = (event: MouseEventParams<Time>) => {
    const pane = attached?.series.getPane().paneIndex();
    const next =
      event.point && (event.paneIndex === undefined || event.paneIndex === pane)
        ? hit(event.point.x, event.point.y)?.id
        : undefined;
    if (next !== hovered) {
      hovered = next;
      attached?.requestUpdate();
    }
  };
  const renderer: IPrimitivePaneRenderer = {
    draw(target) {
      target.useMediaCoordinateSpace(({ context, mediaSize }) => {
        context.save();
        context.lineWidth = 2;
        context.lineJoin = 'round';
        context.setLineDash([]);
        context.font = `${fontSize}px ${colors.font}`;
        context.textBaseline = 'middle';
        for (const arrow of arrows) {
          context.strokeStyle = arrow.side === 'buy' ? colors.buy : colors.sell;
          const shoulder = arrow.tip + (arrow.side === 'buy' ? arrow.half : -arrow.half);
          context.beginPath();
          context.moveTo(arrow.x, arrow.tip);
          context.lineTo(arrow.x + arrow.half, shoulder);
          context.lineTo(arrow.x + arrow.stemHalf, shoulder);
          context.lineTo(arrow.x + arrow.stemHalf, arrow.tail);
          context.lineTo(arrow.x - arrow.stemHalf, arrow.tail);
          context.lineTo(arrow.x - arrow.stemHalf, shoulder);
          context.lineTo(arrow.x - arrow.half, shoulder);
          context.closePath();
          context.stroke();
          const text = arrow.side === 'buy' ? '买（模）' : '卖（模）';
          const textWidth = context.measureText(text).width;
          const middle = Math.max(arrow.tip, arrow.tail) + 1 + arrow.margin + fontSize * 0.6;
          const left = arrow.x - textWidth / 2;
          arrow.label = {
            left,
            right: left + textWidth,
            top: middle - fontSize / 2 - 1,
            bottom: middle + fontSize / 2 + 1,
          };
          context.fillStyle = context.strokeStyle;
          context.fillText(text, left, middle);
        }
        const active = arrows.find((arrow) => arrow.id === hovered);
        if (active) drawTooltip(context, active, mediaSize.width, mediaSize.height, colors);
        context.restore();
      });
    },
  };
  return {
    attached(parameters) {
      attached = parameters;
      parameters.chart.subscribeCrosshairMove(move);
      parameters.requestUpdate();
    },
    detached() {
      attached?.chart.unsubscribeCrosshairMove(move);
      attached = undefined;
      arrows = [];
      hovered = undefined;
    },
    updateAllViews() {
      const previous = arrows.find((arrow) => arrow.id === hovered);
      arrows = [];
      if (!attached) return;
      const time = attached.chart.timeScale(),
        height = attached.series.getPane().getHeight();
      const size = arenaArrowSize(time.options().barSpacing);
      fontSize = attached.chart.options().layout.fontSize;
      const lineHeight = Math.ceil(fontSize * 1.2),
        maximum = height - lineHeight - size.margin - 4;
      for (const group of groups.values()) {
        const stamp = toChartTime(group.key),
          x = time.timeToCoordinate(stamp);
        const logical = x === null ? null : time.timeToIndex(stamp, false);
        const bar = logical === null ? null : attached.series.dataByIndex(logical);
        if (!bar || x === null) continue;
        const price = markerBarPrice(bar, group.side);
        if (price === undefined) continue;
        const y = attached.series.priceToCoordinate(price);
        if (y === null || y < 0 || y > height) continue;
        const tip =
          group.side === 'buy'
            ? Math.max(4, Math.min(maximum - size.half * 2 - 1, y + size.margin + 1))
            : Math.max(
                size.half * 2 + 5,
                Math.min(maximum - 1, y - size.margin * 2 - lineHeight - 1),
              );
        arrows.push({
          ...group,
          ...size,
          x,
          tip,
          tail: tip + (group.side === 'buy' ? size.half * 2 : -size.half * 2),
        });
      }
      const current = arrows.find((arrow) => arrow.id === hovered);
      if (!current || (previous && (current.x !== previous.x || current.tip !== previous.tip)))
        hovered = undefined;
    },
    paneViews: () => [{ zOrder: () => 'top', renderer: () => renderer }],
    hitTest(x, y) {
      const arrow = hit(x, y);
      return arrow
        ? { externalId: arrow.id, zOrder: 'top', cursorStyle: 'pointer', hitTestPriority: 2 }
        : null;
    },
  };
}

function markerBarPrice(
  bar: NonNullable<ReturnType<SeriesAttachedParameter<Time>['series']['dataByIndex']>>,
  side: Point['side'],
) {
  let price: number | undefined;
  if ('high' in bar && typeof bar.high === 'number' && 'low' in bar && typeof bar.low === 'number')
    price = side === 'buy' ? bar.low : bar.high;
  else if ('value' in bar && typeof bar.value === 'number') price = bar.value;
  return price;
}

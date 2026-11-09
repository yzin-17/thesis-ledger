import type {
  IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesPrimitive, SeriesAttachedParameter, Time,
} from 'lightweight-charts';
import { toChartTime } from './market-chart-time.js';
import type { ChartMeasurement } from './chart-measurement-model.js';

export function createMeasurementPrimitive(
  measurement: Pick<ChartMeasurement, 'from' | 'to'>,
): ISeriesPrimitive<Time> {
  let attached: SeriesAttachedParameter<Time> | undefined;
  let rectangle: { left: number; width: number } | undefined;
  const renderer: IPrimitivePaneRenderer = {
    draw(target) {
      const area = rectangle;
      if (!area) return;
      target.useMediaCoordinateSpace(({ context, mediaSize }) => {
        context.save();
        context.fillStyle = 'rgba(37, 99, 235, 0.16)';
        context.strokeStyle = 'rgba(37, 99, 235, 0.9)';
        context.lineWidth = 2;
        context.fillRect(area.left, 0, area.width, mediaSize.height);
        context.strokeRect(area.left, 1, area.width, Math.max(0, mediaSize.height - 2));
        context.restore();
      });
    },
  };
  const views: IPrimitivePaneView[] = [{ zOrder: () => 'top', renderer: () => renderer }];
  return {
    attached(parameters) {
      attached = parameters;
      parameters.requestUpdate();
    },
    detached() {
      attached = undefined;
      rectangle = undefined;
    },
    updateAllViews() {
      rectangle = undefined;
      if (!attached) return;
      const timeScale = attached.chart.timeScale();
      const x1 = timeScale.timeToCoordinate(toChartTime(measurement.from));
      const x2 = timeScale.timeToCoordinate(toChartTime(measurement.to));
      if (x1 === null || x2 === null) return;
      const width = Math.max(8, Math.abs(x2 - x1) + timeScale.options().barSpacing);
      rectangle = {
        left: (x1 + x2 - width) / 2,
        width,
      };
    },
    paneViews: () => views,
  };
}

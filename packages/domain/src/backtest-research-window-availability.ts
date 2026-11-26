import type { ResearchInputNeed } from './backtest-research-inputs.js';
import type { ResearchScopeSourceInput } from './backtest-research-data-scope.js';

type WindowPoint = { time: number; usable: boolean };
const rootPath = (path: readonly (string | number)[]) =>
  path.slice(0, path[0] === 'tradePlan' ? 2 : 1);

function consumerWindows(source: ResearchScopeSourceInput | undefined,
  fields: ResearchInputNeed['fields'], required: number): WindowPoint[] {
  if (!source) return [];
  const values = fields.map((field) => new Map(source.series.find((series) => series.field === field)
    ?.points.map((point) => [Date.parse(point.occurredAt),
      point.status !== 'unavailable' && point.value !== undefined]) ?? []));
  const times = [...new Set(source.series.flatMap((series) =>
    series.points.map((point) => Date.parse(point.occurredAt))))].sort((a, b) => a - b);
  let run = 0;
  return times.map((time) => {
    run = values.every((field) => field.get(time)) ? run + 1 : 0;
    return { time, usable: run >= required };
  });
}

function at(points: readonly WindowPoint[], time: number): boolean {
  let lo = 0, hi = points.length;
  while (lo < hi) {
    const middle = (lo + hi) >>> 1;
    if (points[middle]!.time <= time) lo = middle + 1;
    else hi = middle;
  }
  return lo > 0 && points[lo - 1]!.usable;
}

/** 复核同一规则所需原始窗口的交集；不执行交易、不补行情、不替代数值求值诊断。 */
export function researchJointWindowIssues(needs: readonly ResearchInputNeed[],
  sources: readonly ResearchScopeSourceInput[], decisionTimes: readonly string[], analysisStartAt: string) {
  const groups = new Map<string, { path: readonly (string | number)[]; windows: WindowPoint[][] }>();
  for (const need of needs) {
    if (need.necessity === 'optional') continue;
    const source = sources.find((item) => item.coordinate === need.coordinate && item.timeframe === need.timeframe);
    for (const consumer of need.consumers) {
      const path = rootPath(consumer.path), key = JSON.stringify(path);
      const group = groups.get(key) ?? { path, windows: [] };
      group.windows.push(consumerWindows(source, [...consumer.fields], consumer.minimumWarmupRows));
      groups.set(key, group);
    }
  }
  const start = Date.parse(analysisStartAt);
  const times = [...new Set(decisionTimes.map(Date.parse).filter((time) => time >= start))];
  return [...groups.values()].filter((group) =>
    !times.some((time) => group.windows.every((window) => at(window, time))))
    .map((group) => ({ stage: 'data-scope' as const, code: 'DATA_SCOPE_JOINT_WINDOW', path: group.path,
      message: '规则所需字段及预热窗口在研究区间没有共同可计算时点' }));
}

import { DecimalValue } from './decimal.js';
interface ChartFrame {
  at: string;
  marks: readonly { agentId: string; nav: string | null }[];
  benchmarks: readonly { id: string; nav: string | null }[];
}
/** 限制传输点数时同时保留各曲线极值和数据缺口，收益计算仍使用完整序列。 */
export function arenaChartFrames<T extends ChartFrame>(frames: readonly T[], maxPoints = 2000): T[] {
  if (frames.length <= maxPoints) return [...frames];
  const series = (f: T) => [...f.marks.map((m) => ({ id: m.agentId, value: m.nav })), ...f.benchmarks.map((m) => ({ id: 'baseline:' + m.id, value: m.nav }))];
  const width = Math.max(1, series(frames[0]!).length);
  const buckets = Math.max(1, Math.floor(maxPoints / (2 * width + 4)));
  const size = Math.ceil(frames.length / buckets), selected = new Set<number>([0, frames.length - 1]);
  // 缺口边界优先于软点数上限，避免抽样把不连续行情连接起来。
  const prior = new Map<string, boolean>();
  for (let index = 0; index < frames.length; index++) for (const point of series(frames[index]!)) {
    const missing = point.value === null;
    if (prior.has(point.id) && prior.get(point.id) !== missing) {
      selected.add(index); selected.add(index - 1);
    }
    prior.set(point.id, missing);
  }
  for (let start = 0; start < frames.length; start += size) {
    const end = Math.min(start + size, frames.length);
    selected.add(start); selected.add(end - 1);
    const extremes = new Map<string, { min: { index: number; value: string }; max: { index: number; value: string } }>();
    let firstMissing: number | undefined, lastMissing: number | undefined;
    for (let index = start; index < end; index++) for (const point of series(frames[index]!)) {
      if (point.value === null) { firstMissing ??= index; lastMissing = index; continue; }
      const previous = extremes.get(point.id);
      if (!previous) extremes.set(point.id, { min: { index, value: point.value }, max: { index, value: point.value } });
      else {
        if (DecimalValue.from(point.value).compareTo(previous.min.value) < 0) previous.min = { index, value: point.value };
        if (DecimalValue.from(point.value).compareTo(previous.max.value) > 0) previous.max = { index, value: point.value };
      }
    }
    for (const { min, max } of extremes.values()) { selected.add(min.index); selected.add(max.index); }
    if (firstMissing !== undefined) selected.add(firstMissing);
    if (lastMissing !== undefined) selected.add(lastMissing);
  }
  return [...selected].sort((a, b) => a - b).map((i) => frames[i]!);
}

import { useState } from 'react';
import { arenaSeriesColors, arenaWindowDate, arenaDateAt, arenaRatio, type ArenaChartPeriod } from '@thesis-ledger/domain';
import type { ArenaLiveDetail } from '@thesis-ledger/schemas';
import { MobileChart } from '../../platform/charts/MobileChart';
import type { ChartLine } from '../../platform/charts/chart-document';
import { Choices, Copy, ContentSection as Section, Action } from '../../components/MobilePrimitives';
import { View, Text } from 'react-native';
export function ArenaLiveChart({ detail }: { detail: ArenaLiveDetail }) {
  const [period, setPeriod] = useState<ArenaChartPeriod>('all'), [metric, setMetric] = useState('return');
  const [hidden, setHidden] = useState<string[]>([]), [point, setPoint] = useState<number | null>(null);
  const cutoff = arenaWindowDate(period, detail.frames.at(-1)?.at ?? new Date().toISOString(), detail.protocol.timeZone);
  const frames = detail.frames.filter((f) => arenaDateAt(f.at, detail.protocol.timeZone) >= cutoff);
  const rows = [...detail.agents.map((a, i) => ({ id: a.id, name: a.model, color: arenaSeriesColors[i % arenaSeriesColors.length]!, baseline: false })),
    ...detail.protocol.benchmarks.map((id, i) => ({ id, name: id === 'cash' ? '现金基准' : '固定篮子', color: i ? '#78716c' : '#94a3b8', baseline: true }))];
  const lines: ChartLine[] = rows.filter((r) => !hidden.includes(r.id)).map((r) => {
    const values: ChartLine['values'] = [], breakBefore: number[] = [];
    let missing = false;
    for (const [time, f] of new Map(frames.map((f) => [Math.floor(Date.parse(f.at) / 1000), f]))) {
      if (f.gapBefore.includes((r.baseline ? 'baseline:' : 'agent:') + r.id)) missing = true;
      const mark = r.baseline ? f.benchmarks.find((m) => m.id === r.id) : f.marks.find((m) => m.agentId === r.id);
      const raw = metric === 'nav' ? mark?.nav : mark?.returnRatio;
      if (raw == null) { missing = true; continue; }
      if (missing && values.length) breakBefore.push(time);
      missing = false; values.push({ time, value: Number(raw) * (metric === 'nav' ? 1 : 100) });
    }
    return { name: r.name, color: r.color, values, breakBefore };
  });
  return <Section title={metric === 'nav' ? '账户净值' : '赛季累计收益'}>
    <Choices label="时间范围" value={period} onChange={setPeriod} options={[{ value: 'today', label: '今日' }, { value: 'week', label: '近一周' }, { value: 'month', label: '近一月' }, { value: 'all', label: '全部' }]} />
    <Choices label="图表指标" value={metric} onChange={setMetric} options={[{ value: 'return', label: '累计收益' }, { value: 'nav', label: '净值' }]} />
    {frames.length ? <MobileChart key={detail.id + period} onPointTime={setPoint} data={{ kind: 'arena-performance', main: 'line', candles: [], lines, timeZone: detail.protocol.timeZone, valueFormat: metric === 'nav' ? 'price' : 'percent' }} /> : <Copy muted>此范围暂无合格估值</Copy>}
    {point !== null && <View testID="arena-chart-point"><Copy muted>{new Date(point * 1000).toLocaleString('zh-CN', { timeZone: detail.protocol.timeZone })}</Copy>{frames.find((f) => Math.floor(Date.parse(f.at) / 1000) === point)?.marks.map((m) => <Copy key={m.agentId}>{detail.agents.find((a) => a.id === m.agentId)?.model} · {metric === 'nav' ? m.nav ?? '未估值' : arenaRatio(m.returnRatio)}</Copy>)}</View>}
    {rows.map((r) => <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ color: r.color }}>●</Text><View style={{ flex: 1 }}><Action label={(hidden.includes(r.id) ? '显示 ' : '隐藏 ') + r.name} onPress={() => setHidden(hidden.includes(r.id) ? hidden.filter((id) => id !== r.id) : [...hidden, r.id])} /></View></View>)}
    <Copy muted>收益从赛季本金起算，时间筛选只裁剪曲线。{detail.protocol.currency} · {detail.protocol.timeZone}</Copy>
    <Copy muted>所选区间收益</Copy>{detail.periodReturns.find((r) => r.period === period)?.rows.map((r) => <Copy key={r.agentId}>{detail.agents.find((a) => a.id === r.agentId)?.model} · {arenaRatio(r.returnRatio)}</Copy>)}
  </Section>;
}

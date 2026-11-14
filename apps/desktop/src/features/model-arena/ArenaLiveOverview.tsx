import type { ArenaLiveDetail } from '@thesis-ledger/schemas';
import { arenaLiveLabel, arenaTimelineLabel, arenaTimelineReason, formatDecimalNumber } from '@thesis-ledger/domain';
import { formatDateTimeWithLocalZone } from '@/lib/date-display';
import { ArenaDateRange, ArenaFacts } from './ArenaDetailShell.js';

const markets = { CN: 'A股', HK: '港股', US: '美股' } as const;

export function ArenaLiveOverview({ detail: d }: { detail: ArenaLiveDetail }) {
  const latest = d.state === 'ended' ? d.sealedFrame : d.frames.at(-1);
  const first = d.frames.find((frame) => frame.kind !== 'gap');
  const dateLabel = (value: string | null | undefined, empty: string) =>
    value ? formatDateTimeWithLocalZone(value) : empty;

  return (
    <section className="grid min-w-0 gap-4">
      <h2 className="text-xl font-semibold">比赛概况</h2>
      <ArenaFacts
        items={[
          ['比赛状态', arenaLiveLabel(d.state)],
          ['市场', markets[d.protocol.market]],
          ['赛期', <ArenaDateRange start={d.protocol.startsOn} end={d.protocol.endsOn} />],
          ['参赛模型', d.agents.length + ' 个'],
          ['每模型初始本金', formatDecimalNumber(d.protocol.initialCash) + ' ' + d.protocol.currency],
          ['选股范围', d.protocol.universe === 'fixed' ? '固定标的池' : '全市场自主选股'],
          ['实际启动', dateLabel(d.startedAt, '尚未启动')],
          ['曲线起点', dateLabel(first?.at, '尚无记录')],
          ['最新共同估值', dateLabel(latest?.at, '尚无记录')],
        ]}
      />
      {(d.timeline || d.state === 'draft' || d.state === 'paused' || d.state === 'ended') && (
        <div className="grid gap-2 text-xs text-muted-foreground">
          {(d.timeline || d.state === 'draft') && (
            <p>从设定的开始日期回放，追至当前后继续实时运行。</p>
          )}
          {d.timeline && (
            <p>运行进度：{arenaTimelineLabel(d.timeline)}</p>
          )}
          {d.timeline?.phase === 'replay' && (
            <p>已推进至 {dateLabel(d.timeline.pendingAt ?? d.timeline.cursorAt, '尚无记录')}</p>
          )}
          {d.timeline?.reason && <p>{arenaTimelineReason(d.timeline.reason)}</p>}
          {d.state === 'paused' && (
            <p>委托已保留，研究与模拟成交暂停。恢复后将为可继续研究的模型预约一次决策；研究不限开市，委托及成交仍受交易时段限制。</p>
          )}
          {d.state === 'ended' && (
            <p>
              比赛已封存，持仓保留，剩余委托已撤销。
              {d.sealedFrame
                ? '最终共同估值时间：' + dateLabel(d.sealedFrame.at, '尚无记录')
                : '尚无完整共同估值，无法确定最终排名。'}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

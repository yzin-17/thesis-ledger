type Season = { startsOn: string | null; endsOn: string | null };
/** 按比赛市场时区的日期校验赛期；交易是否开市由独立的会话证据判断。 */
export function arenaLiveDateAllowed(p: Season, day: string) {
  return (!p.startsOn || day >= p.startsOn) && (!p.endsOn || day <= p.endsOn);
}
export function arenaLiveSeasonEnded(p: Season, day: string, latestCompleted?: string | null) {
  return Boolean(p.endsOn && (day > p.endsOn || latestCompleted && latestCompleted >= p.endsOn));
}
export function arenaSeasonLabel(p: Season) {
  if (p.startsOn && p.endsOn) return p.startsOn + ' 至 ' + p.endsOn;
  if (p.startsOn) return p.startsOn + ' 起 · 手动结束';
  if (p.endsOn) return '启动后至 ' + p.endsOn;
  return '手动启动 · 手动结束';
}

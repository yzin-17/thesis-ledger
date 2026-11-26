import type { ArenaPaperCondition } from './arena-live-types.js';
export const arenaLiveLabels: Readonly<Record<string, string>> = {
  draft: '草稿', running: '运行中', paused: '已暂停', ended: '已结束', waiting: '等待预约', researching: '研究中',
  needs_attention: '需要处理', budget_exhausted: '预算耗尽', pending: '等待执行', succeeded: '已完成', failed: '失败',
  unknown_usage: '调用结果未知', cancelled: '已取消', active: '有效', filled: '已成交', expired: '已到期', rejected: '已拒绝',
  waiting_parent: '等待父单成交', awaiting_parent_fill: '尚未激活，不占用已有持仓', parent_unfilled: '父单已结束',
  waiting_entry: '等待前批全成', awaiting_previous_entry: '前批全成后激活，资金已预留', previous_entry_incomplete: '前批未全成已结束',
  awaiting_next_entry: '已退出当前份额，等待后续入场', awaiting_parent_quantity: '当前档位额度已用完或不足一手，等待新增入场', protection_exit_cancelled_entry: '保护已退出，入场余量已撤销',
  plan_position_closed: '本批持仓已退出', paired_exit_filled: '配对腿已成交', model_cancelled: '已按决策撤销',
  exit_quantity_below_lot: '分档退出数量不足一手',
  market: '市价', limit: '限价', stop_loss: '止损', take_profit: '止盈', delivery_pending: '等待投递',
  market_closed: '等待开市', calendar_unavailable: '交易日历不可用', calendar_incomplete: '交易日历覆盖不足',
  calendar_future: '交易日历尚不可见', calendar_invalid: '交易日历无效', account_conflict: '研究期间账户已变化',
  participant_budget: '参赛模型预算不足', competition_budget: '比赛总预算不足', unknown_pricing: '模型计价未就绪',
  input_limit: '研究输入超过上限', output_limit_unsupported: '当前模型路由不支持所需的输出额度限制',
  request_limit_unrepresentable: '请求额度过大，请设置可执行的单次输出上限',
  model_identity_unverified: '返回模型身份未确认', model_output_invalid: '模型输出无效',
  research_failed: '研究未完成', research_steps_exhausted: '研究步骤已用尽', tool_budget_exhausted: '研究工具额度已用尽',
  replay_rules_unavailable: '缺少该时点的成交规则', replay_prices_unavailable: '缺少该时点的历史价格', replay_tools_unavailable: '该历史资料暂不可用',
  cycle_deadline: '研究已超时', cycle_not_active: '研究周期已结束', request_outcome_unknown: '调用结果未知',
  research_control_unavailable: '研究执行状态暂不可确认', worker_stopping: '执行服务正在停止',
  infrastructure_attempts_exhausted: '执行重试次数已用尽', execution_evidence_missing: '缺少合格执行行情',
  valuation_price_missing: '缺少估值价格', common_valuation_incomplete: '共同估值不完整',
  corporate_action_unverified: '公司行动资料不完整', execution_rules_unavailable: '交易规则不可用',
  live_tradability_unavailable: '可交易性资料不可用', live_quote_unqualified: '执行行情未满足条件',
  order_expired: '委托已到期', arena_ended: '比赛已结束', arena_paused: '比赛已暂停',
};
export const arenaLiveLabel = (value: string | null | undefined) => value ? arenaLiveLabels[value] ?? '资料或执行条件未满足' : '—';

/** 手动请求只安排研究预约；下单与成交才依赖市场交易时段。 */
export function arenaManualDecisionNotice(
  appointment: 'scheduled' | 'already_scheduled' | 'already_in_progress',
  reason: string | null,
) {
  if (appointment === 'already_in_progress')
    return '模型已有等待执行或正在研究的决策周期，无需重复预约；完成后会更新下一次观察计划。';
  const accepted = appointment === 'scheduled' ? '已安排一次决策预约' : '已有待执行的决策预约，未重复提交';
  if (reason === 'market_closed') return `${accepted}。市场未开放也可以研究，满足调度条件后会尝试调用模型；新委托和成交仍须开市。`;
  if (reason?.startsWith('calendar_')) return `${accepted}。日历暂不可用不妨碍研究，但不能据此判断委托能否成交。`;
  return `${accepted}。研究将由调度程序尝试执行；模拟委托与成交仍需交易时段和合格行情。`;
}
export function arenaAppointmentLabel(condition: ArenaPaperCondition, name: (symbol: string) => string = (s) => s) {
  if (condition.kind === 'time') return '预约时间 · ' + condition.at;
  if (condition.kind === 'fill') return condition.symbol ? name(condition.symbol) + ' 成交后观察' : '任意委托成交后观察';
  return name(condition.symbol) + ' 价格' + (condition.operator === 'gte' ? ' ≥ ' : ' ≤ ') + condition.price + ' 时重新研究';
}
export const arenaSeriesColors = ['#2563eb', '#d97706', '#059669', '#db2777', '#7c3aed', '#0891b2', '#65a30d', '#c2410c', '#be123c', '#4f46e5', '#0f766e', '#a16207'];
export type ArenaChartPeriod = 'today' | 'week' | 'month' | 'all';
export function arenaWindowDate(period: ArenaChartPeriod, at: string, timeZone: string) {
  if (period === 'all') return '';
  let offset = 0;
  if (period === 'week') offset = 6;
  else if (period === 'month') offset = 29;
  const date = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
  return new Date(Date.parse(date + 'T00:00:00Z') - offset * 86400000).toISOString().slice(0, 10);
}
export const arenaDateAt = (at: string, timeZone: string) => new Intl.DateTimeFormat('en-CA', {
  timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(at));

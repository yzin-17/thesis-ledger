const labels: Record<string, string> = {
  hold: '继续持有',
  budget: '额度不足',
  below_lot: '不足一手',
  partially_filled: '部分成交',
  insufficient_cash: '模拟现金不足',
  opening_evidence_missing: '开盘证据不足',
  opening_valuation_missing: '已有仓位缺少开盘估值',
  opening_price_unavailable: '缺少合格开盘价',
  opening_window_missed: '错过开盘取证窗口',
  corporate_action_unverified: '公司行动未核实',
  opening_tradability_and_rules_missing: '开盘时的可交易状态和执行规则均未核实',
  opening_tradability_missing: '开盘时的可交易状态未核实',
  opening_execution_rules_missing: '开盘时适用的执行规则未核实',
  market_rules_unqualified: '交易规则证据不足',
  price_limit_unknown: '价格限制未核实',
  settlement_unqualified: '结算规则未核实',
  trading_status_unknown: '交易状态未核实',
  price_limit: '触及价格限制',
  suspended: '停牌',
  opening_source_unavailable: '开盘来源不可用',
  price_unavailable: '价格不可用',
  arena_paused: '比赛已暂停',
  arena_ended: '比赛已结束',
  draft: '草稿',
  running: '进行中',
  paused: '已暂停',
  ended: '已结束',
  unopened: '未开轮',
  open: '决策中',
  sealed: '已封存',
  pending: '等待研究材料',
  ready: '等待模型',
  dispatching: '模型研究中',
  participant_budget: '参赛模型额度不足',
  competition_budget: '比赛总额度不足',
  unknown_pricing: '模型费用待确认',
  decision: '已形成决策',
  observe: '观望',
  missing_material: '研究材料不足',
  timeout: '已超时',
  model_identity_unverified: '模型身份未核实',
  invalid_output: '模型输出无效',
  unknown_usage: '用量待确认',
  late_receipt: '迟到回执',
  cancelled: '已取消',
  route_unavailable: '模型不可用',
  input_limit: '研究材料超过输入上限',
};
export function arenaStatusLabel(value: string) {
  return labels[value] ?? '状态待核对';
}
export function arenaActionLabel(action: {
  action: 'hold' | 'observe' | 'target';
  weightBps?: number;
}) {
  if (action.action === 'observe') return '观望';
  if (action.action === 'hold') return '继续持有';
  return '目标仓位 ' + Number(action.weightBps) / 100 + '%';
}

export function arenaRatio(value: string | null) {
  const formatted = formatDecimalRatioPercent(value);
  return formatted === '—' ? '资料不足' : formatted;
}

export function arenaObservationLabel(row: {
  state: 'pending' | 'missing_price' | 'basis_unverified' | 'ready';
  change: string | null;
  high: string | null;
  low: string | null;
}) {
  if (row.state === 'pending') return '未到观察期';
  if (row.state === 'missing_price') return '缺少价格';
  if (row.state === 'basis_unverified') return '公司行动口径待核实';
  return (
    '涨跌 ' +
    arenaRatio(row.change) +
    ' · 区间最高 ' +
    arenaRatio(row.high) +
    ' · 区间最低 ' +
    arenaRatio(row.low)
  );
}

export function arenaCostLabel(e: {
  modelCost: string | null;
  costCurrency: string | null;
  costStatus: 'known' | 'estimated' | 'unknown';
}) {
  if (e.modelCost === null) return '待确认';
  return (
    (e.costStatus === 'estimated' ? '按定价估算 ' : '') + e.modelCost + ' ' + (e.costCurrency ?? '')
  );
}
import { formatDecimalRatioPercent } from './ratio-percent.js';

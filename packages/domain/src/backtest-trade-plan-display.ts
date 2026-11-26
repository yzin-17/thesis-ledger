import { DecimalValue as D } from './decimal.js';
import { activeBacktestTradePlan, type BacktestTradePlan } from './backtest-trade-plan-contract.js';
import { describeBacktestExpression } from './backtest-expression-display.js';
import { tradePlanProtectionRules } from './backtest-trade-protection.js';
import { monthlyRebalanceLines } from './backtest-trade-monthly-display.js';

const percent = (value: string) => D.from(value).times('100').toString() + '%';
export function backtestTradePlanLines(
  plan: BacktestTradePlan | undefined,
  unit?: string,
  sources: ReadonlyMap<string, string> = new Map(),
  dailyOrders = false,
  timezones: ReadonlyMap<string, string> = new Map(),
): string[] {
  if (!plan || !activeBacktestTradePlan(plan)) return [];
  const lines = [
    dailyOrders ? '交易计划条件按已完成主周期收盘判断，建仓、普通退出与阶段采用各自配置的委托；计划中的收盘保护仍在后续开盘市价退出，附属触价保护按自己的价格与激活时点撮合。' : '交易计划按已完成主周期的收盘价判断，触发后于下一可交易开盘市价成交；跳空和费用会改变实际结果，不保证触发价成交。',
    `比例投入在${dailyOrders ? '委托' : '执行'}时计入滑点与全部买入费用，超额只缩量；仅保护、冷却或暂停不改变普通入场仓位。`,
  ];
  lines.push(...protectionLines(plan, sources, timezones));
  if (plan.riskBudget)
    lines.push(
      `首次入场数量＝委托时可见权益 × ${percent(plan.riskBudget.equityFraction)} ÷ 初始止损距离；执行时已有持仓与本次含费用、滑点支出合计最多为权益的 ${percent(plan.riskBudget.maxEquityFraction)}，再受可用现金和交易单位约束。此风险预算替代普通首次入场仓位，跳空与费用可能使实际损失超过风险预算。`,
    );
  lines.push(...volatilityLines(plan.volatilityTarget));
  lines.push(...monthlyRebalanceLines(plan.monthlyRebalance));
  for (const s of plan.stages) {
    const trigger =
      s.trigger.kind === 'gainPercent'
        ? `收盘价相对首次实际入场价格上涨至少 ${percent(s.trigger.value)}`
        : `收盘价相对首次实际入场价格上涨至少 ${s.trigger.value} 倍冻结入场 ATR`;
    const action =
      s.action.kind === 'reduce'
        ? `卖出${s.action.basis === 'initialQuantity' ? '首次实际买入数量' : '该阶段首次下单时剩余数量'}的 ${percent(s.action.fraction)}`
        : `追加首次实际买入数量的 ${percent(s.action.initialFraction)}，总持仓投入上限为权益的 ${percent(s.action.maxEquityFraction)}`;
    lines.push(
      `阶段 ${s.id}：${trigger}时，${action}。${unit ? `数量单位为${unit}` : '数量单位由回测执行口径确定'}；原始股数按手数向下取整，不足一手跳过，研究单位保留小数。每轮只执行一次，目标首次下单时冻结、扣除本阶段已成交数量，待成交不重复下单，拒单不计完成。`,
    );
  }
  if (plan.cooldown)
    lines.push(
      `实际全部平仓后冷却：普通退出 ${plan.cooldown.bars} 根、止损退出 ${plan.cooldown.stopBars} 根已完成主周期；部分卖出或拒单不启动，冷却结束后重新检查入场条件。`,
    );
  if (plan.lossPause)
    lines.push(
      `亏损暂停：最近 ${plan.lossPause.completedTrades} 笔完整平仓交易全部净亏损后，暂停随后 ${plan.lossPause.tradingDays} 个完整交易日的新开仓，第 ${plan.lossPause.tradingDays + 1} 个交易日重新检查入场条件。成交净收益扣除买卖费用；现金分配单独记账，不参与亏损判定。部分卖出、未平仓和拒单不记一笔，零收益不算亏损；只由新的完整平仓启动，旧窗口不重复启动。使用冻结交易日历，不按行情根数计时。${plan.cooldown ? '与平仓冷却同时满足。' : ''}`,
    );
  lines.push(...priorityLines(plan));
  return lines;
}

function protectionLines(plan: BacktestTradePlan, sources: ReadonlyMap<string, string>, timezones: ReadonlyMap<string, string>): string[] {
  const lines: string[] = [];
  const stop = plan.initialStop;
  if (stop?.kind === 'percent')
    lines.push(`初始止损：实际入场成交价下方 ${percent(stop.percent)}，只保护本轮持仓。`);
  if (stop?.kind === 'entryAtr')
    lines.push(
      `初始止损：实际入场成交价减去委托生成时最后可见 ATR(${stop.period}) 的 ${stop.multiple} 倍；入场后冻结距离，不随 ATR 回落或加仓放宽。`,
    );
  if (plan.trailing) {
    const t = plan.trailing;
    const distance =
      t.kind === 'currentAtr'
        ? `最高有效收盘价减当前可见 ATR(${t.period}) 的 ${t.multiple} 倍，每个已完成收盘重算；缺失、不可见或非正 ATR 不更新，保留已有保护；首次取得有效 ATR 前没有该条追踪保护`
        : `自入场后的最高有效收盘价回撤 ${percent(t.drawdownPercent)}`;
    lines.push(
      `追踪止损：${distance}；${t.activationGainPercent ? `最高收盘浮盈达到 ${percent(t.activationGainPercent)} 后启用` : '持仓后启用'}，保护线只收紧不放松。`,
    );
    if (t.breakEvenGainPercent)
      lines.push(
        `保本：最高收盘浮盈达到 ${percent(t.breakEvenGainPercent)} 后，保护线至少提高到首次成交价格，不包含费用。`,
      );
  }
  for (const { key, expression } of tradePlanProtectionRules(plan))
    lines.push(
      `${key === 'initialStop' ? '初始止损' : '追踪保护'}启用条件：${describeBacktestExpression(expression, sources, timezones)}。持仓后收盘条件首次成立即永久启用，本轮持仓内条件转假或不可用也不撤销；未启用前没有该条保护，全部实际平仓后重置。${key === 'trailing' && plan.trailing?.activationGainPercent ? '同时仍须达到该条盈利激活门槛。' : ''}`,
    );
  return lines;
}

function priorityLines(plan: BacktestTradePlan): string[] {
  if (plan.volatilityTarget)
    return ['同一期先执行风险清仓，再普通退出，最后按目标波动率调仓；增仓不重置首次入场锚点。'];
  if (plan.monthlyRebalance) return [];
  return [
    '同一期先执行风险清仓，再普通退出，再减仓，最后加仓；加仓不重置首次数量、入场锚点或已完成阶段。',
  ];
}

function volatilityLines(v: BacktestTradePlan['volatilityTarget']): string[] {
  if (!v) return [];
  return [
    `目标波动率仓位：每个日线收盘用最近 ${v.returnPeriods + 1} 个有效收盘计算 ${v.returnPeriods} 个简单收益，样本标准差乘以√${v.annualizationPeriods}年化；目标权益仓位＝${percent(v.targetAnnualVolatility)}÷年化波动率，最高 ${percent(v.maxEquityFraction)}。持仓期间每日主动增减仓，替代普通仓位；空仓仍须满足入场条件和暂停限制。样本不足、不可见、缺失或零波动不新增投入，不强制清仓。收盘冻结目标差额，在后续可交易开盘按资金、手数和可售持仓执行；买入时已有持仓加含费用、滑点支出不得超过目标比例，超额只缩量，低开不放大委托。被动价格变化仍可能造成权重偏差。仅日线，不能与按止损距离定仓或一次性分批计划组合。`,
  ];
}

export const BACKTEST_TRADE_PLAN_ATR_FORMAT_PROMPT =
  'ATR 参数中 period 是正整数，multiple 是十进制字符串；例如14期3倍写成 period:14、multiple:"3"，不能把倍数写成 JSON 数值。示例参数须替换成本次真实要求。';

export const BACKTEST_TRADE_PLAN_PROMPT =
  '能力字典按需选择，不是填满模板。无独立风控risk=[]，无阶段stages=[]。例：“投入权益30%”仅sizing.percent="0.3"；“允许损失权益1%并按止损距离定仓”才riskBudget.equityFraction="0.01"。比例用小数，收盘判/后开盘成交。' +
  '普通保护例：“投入权益30%，首笔成交价下方8%止损”对应sizing={"type":"percentOfEquity","percent":"0.3"}、risk=[]、tradePlan={"version":1,"evaluation":"barClose","stages":[],"initialStop":{"kind":"percent","percent":"0.08","activation":{"kind":"immediate"}}}；不附加风险预算。其他保护及冷却依实际要求替换或补全，不照抄示例数值。' +
  '先按需求选择距离：“买入时ATR冻结距离”用initialStop.kind="entryAtr"；“每个收盘最高价减当前ATR”用trailing.kind="currentAtr"，不附送initialStop。固定百分比必须kind="percent"且填写percent；只有明确要求ATR才用ATR距离，并填sourceId、period、multiple，来源series含high/low/close；仅收紧、缺ATR留线。再独立写activation：立即保护为{kind:"immediate"}，条件启用为{kind:"condition",condition:完整布尔树}，不因条件启用而改变距离类型。条件不挪entry/exit，持仓收盘成立永久启用，全平重置。' +
  'riskBudget仅按明确损失风险/止损距离定仓，须无条件初始保护。reduce的initialQuantity=首次、remainingQuantity=剩余；add按首次且封顶。cooldown按根；lossPause按完整净亏笔数/交易日。volatilityTarget每日调仓，monthlyRebalance月末调仓，不代替固定投入。' +
  '空仓用{"type":"not","expression":{"type":"positionState","field":"isOpen"}}；isOpen=true是已持仓。普通退出恒假用{"type":"compare","operator":"eq","left":{"type":"constant","value":"0"},"right":{"type":"constant","value":"1"}}，不再叠加保护退出。sessionValue.vwap当日累计收盘价×量，VWAP为滚动；分钟elapsedMinutes，恰好eq N、首小时<=60。' +
  '条件保护例：“首笔价下方8%止损，RSI(6)上穿70后启用；全平等3根”对应tradePlan={"version":1,"evaluation":"barClose","stages":[],"initialStop":{"kind":"percent","percent":"0.08","activation":{"kind":"condition","condition":{"type":"cross","direction":"above","left":{"type":"indicator","name":"RSI","input":{"type":"series","sourceId":"main","field":"close"},"params":{"period":6}},"right":{"type":"constant","value":"70"}}}},"cooldown":{"bars":3,"stopBars":3}}。有等待要求必须写cooldown，不因其他字段可省略而丢掉；条件只启用保护，不限制买入。main及参数换成本次实际值。';

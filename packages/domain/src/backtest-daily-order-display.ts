import type {
  BacktestDailyOrderExecution,
  BacktestOrderValidity,
} from './backtest-order-contract.js';
import { describeBacktestExpression } from './backtest-expression-display.js';

function validity(value: BacktestOrderValidity) {
  if (value.kind === 'position') return '本轮持仓结束或回测结束时终止，可跨夜';
  if (value.kind === 'DAY') return '激活当根结束到期，不跨夜';
  return `自激活起 ${value.bars} 根交易日线有效（含激活根），${value.bars > 1 ? '可跨夜' : '不跨夜'}；停牌不延长`;
}
/** 直接读模板；触价订单与收盘条件保护分别说明。 */
export function backtestDailyOrderLines(
  execution: BacktestDailyOrderExecution,
  sources: ReadonlyMap<string, string>,
  timezones: ReadonlyMap<string, string> = new Map(),
): string[] {
  const lines = execution.orders.map((template) => {
    const action =
      template.action.kind === 'stage'
        ? `阶段 ${template.action.stageId}`
        : { entry: '建仓', exit: '普通退出', stopLoss: '保护性止损', takeProfit: '止盈' }[
            template.action.kind
          ];
    const order =
      template.order.kind === 'market'
        ? '市价委托'
        : `${template.order.kind === 'limit' ? '限价' : '触发后市价'}委托，${template.order.kind === 'limit' ? '限价' : '触发价'}为下单时冻结的${describeBacktestExpression(template.order.price, sources, timezones)}`;
    const parent = template.parent
      ? `父单 ${template.parent.templateId}${template.parent.activation === 'eachFill' ? '每次成交后按量保护' : '全部成交后才启用；部分成交后撤余单不启用'}，仅覆盖该父单尚未退出的实际数量。`
      : '收盘条件成立后提交，从后续开盘参与撮合。';
    return `${action}（${template.id}）：${order}；${validity(template.validity)}。${parent}${template.exitGroup ? `关联退出组 ${template.exitGroup}；部分止盈只缩减止损数量，止损触发取消对应止盈余量及本轮待买单。` : ''}`;
  });
  return [
    '成交方式：日线委托模拟。先处理已知开盘成交，再判断当日区间触价；同组止损、止盈在区间同时触及时止损优先，不推定盘中完整路径。',
    ...lines,
    '委托价格按本次冻结的执行价格坐标解释；常量也采用该坐标。保护性止损触发后取消本轮未成交建仓／加仓，已成交持仓继续按实际余量保护。',
    '保护开始：父单开盘成交后建立的保护可参与当根后续区间；父单区间成交后建立的保护从下一根开盘参与。各保护独立计有效期，DAY 保护可能在首次可撮合前到期。',
    '目标数量及资金预算在下单时冻结，成交只按剩余目标、共享模拟额度、可用资金及可售数量缩减。数量单位和每根模拟额度读取回测配置，研究单位不等于实际股数。',
    '限价成交可按有利开盘价改善，含滑点后仍不越过限价；触发价不保证成交价，跳空与费用会改变结果。已触发的市价余量等待后续成交，仍受有效期约束。最低佣金按同一订单累计，不随模拟拆单重复收取。',
  ];
}

import { ArenaSellAvailabilityError } from '@thesis-ledger/domain';
import { LiveInvalidDecisionError } from './live-invalid-decision.js';

export function liveDecisionFeedback(error: unknown, observedAt: string) {
  if (error instanceof LiveInvalidDecisionError) return {
    decisionRejected: { code: 'schema_invalid', observedAt, accountChanged: false, issues: error.issues },
    instruction: '上一份完整JSON决策未通过Schema，委托、撤单和预约均未提交。请根据issues重新提交完整决策，不只回复补丁。' +
      '卖单不能附onFill或entryAfter；市价委托expiresOn=null；single附属退出只能是止损。' +
      '还须核对sellAvailability和批次availableOn，不能卖出尚未可卖的持仓；无法交易时orders=[]并预约未来观察。',
  };
  if (error instanceof ArenaSellAvailabilityError) return {
    decisionRejected: { code: error.message, reason: error.reason, observedAt, accountChanged: false,
      requestedQuantity: error.requestedQuantity, sellAvailability: error.availability },
    instruction: '上一份决策的卖出数量不可用，委托、撤单和预约均未提交。按sellAvailability区分总持仓、已可卖、尚未可卖和已有委托占用。' +
      '达到availableOn（包含当天）且在实际交易会话内才能卖出；实行T+1的当日买入持仓不能当日卖出，撤保护也不能解除结算限制。' +
      '若是已有委托占用，可明确取消对应订单并重新提交完整决策；否则保留合法保护或orders=[]并预约未来观察。不得用远期到期日绕过。',
  };
  if (!(error instanceof Error) || !['execution_evidence_missing', 'replay_rules_unavailable', 'replay_prices_unavailable', 'replay_tools_unavailable'].includes(error.message)) return null;
  return {
    decisionRejected: { code: error.message, observedAt, accountChanged: false },
    instruction: '上一份决策被拒绝，委托和预约均未提交。execution不可用时，所有新委托都不可提交，限价委托也不能绕过。' +
      '请依据已取得的证据重新生成完整决策；没有可执行标的时，可提交orders=[]的观望与未来时间预约。' +
      '这次只修正决策，不必重复读取已明确不可用的来源；观察时刻须晚于observedAt。',
  };
}

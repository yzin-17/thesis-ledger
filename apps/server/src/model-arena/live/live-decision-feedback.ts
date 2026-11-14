export function liveDecisionFeedback(error: unknown, observedAt: string) {
  if (!(error instanceof Error) || !['execution_evidence_missing', 'replay_rules_unavailable', 'replay_prices_unavailable', 'replay_tools_unavailable'].includes(error.message)) return null;
  return {
    decisionRejected: { code: error.message, observedAt, accountChanged: false },
    instruction: '上一份决策被拒绝，委托和预约均未提交。execution不可用时，所有新委托都不可提交，限价委托也不能绕过。' +
      '请依据已取得的证据重新生成完整决策；没有可执行标的时，可提交orders=[]的观望与未来时间预约。' +
      '这次只修正决策，不必重复读取已明确不可用的来源；观察时刻须晚于observedAt。',
  };
}

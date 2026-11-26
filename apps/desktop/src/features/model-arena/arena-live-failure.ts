/** Only surface validated audit facts; never render raw model output or prompt in the failure summary. */
const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export function arenaResearchFailureDetail(reason: string | null, audit: unknown): string | null {
  if (reason !== 'model_output_invalid') return null;
  const calls = asRecord(audit)?.calls;
  if (!Array.isArray(calls)) return '模型输出未通过交易指令校验，具体内容可在调用审计中查看。';

  const orderedCalls: unknown[] = calls;
  for (const raw of [...orderedCalls].reverse()) {
    const call = asRecord(raw);
    const errorCode = asRecord(call?.error)?.code;
    if (errorCode === 'output_truncated')
      return '模型输出被截断，未返回完整研究指令。可检查单次输出上限和研究内容长度。';
    if (errorCode !== 'schema_invalid') continue;

    const check = asRecord(asRecord(call?.diagnostics)?.contractCheck);
    const issues = check?.issues;
    if (Array.isArray(issues))
      for (const rawIssue of issues) {
        const failure = orderContractFailure(rawIssue);
        if (failure) return failure;
      }
    return '模型返回了 JSON，但内容未通过交易指令 Schema 校验。';
  }
  return '模型输出未通过研究指令校验，具体原因可在调用与资料审计中查看。';
}

function orderContractFailure(rawIssue: unknown): string | null {
  const path = asRecord(rawIssue)?.path;
  if (
    !Array.isArray(path) ||
    path[0] !== 'decision' ||
    path[1] !== 'orders' ||
    !Number.isInteger(path[2])
  )
    return null;
  const index = Number(path[2]) + 1;
  if (path[3] === 'onFill') {
    const field = path.slice(3).filter((part) => typeof part === 'string' || Number.isInteger(part)).join('.');
    return `第 ${index} 笔委托的成交后保护配置 ${field} 未通过校验；当前支持买入全部成交后激活一张固定价格止损，子单须指定有效期并仅退出本批持仓。`;
  }
  if (path[3] === 'exitGroup')
    return `第 ${index} 笔委托的 exitGroup 无效：买入单不能与止损单组成配对退出组；exitGroup 仅用于成对的卖出止盈、止损委托。`;
  if (path[3] === 'expiresOn')
    return `第 ${index} 笔委托的 expiresOn 不符合格式：必须是交易日 YYYY-MM-DD 或 null，不能填写时分秒。`;
  if (typeof path[3] === 'string')
    return `第 ${index} 笔委托的 ${path[3]} 字段未通过交易指令校验。`;
  return null;
}

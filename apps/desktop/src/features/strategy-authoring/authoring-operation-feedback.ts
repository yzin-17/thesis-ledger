const knownFailures: Record<string, string> = {
  AUTHORING_SCHEMA_INVALID:
    '模型返回的结构不符合要求，未应用到草稿。请核对已确认条件，或选择其他可用模型后再执行。',
  AUTHORING_COVERAGE_INVALID:
    '模型结果没有完整对应已确认要求，未应用到草稿。请核对需求清单和问题答案。',
  AUTHORING_SEMANTIC_MISMATCH:
    '模型结果改变了已确认的交易含义，未应用到草稿。请核对条件和实际定义。',
  AUTHORING_MODEL_MISMATCH:
    '实际返回模型与所选模型不一致。请检查配置中的完整模型标识，再决定是否重新执行。',
  AUTHORING_CANCELLED: '本次操作已取消，草稿与已有调用记录已保留。',
  AUTHORING_OUTPUT_TOO_LARGE:
    '模型返回内容超过编写上限，未应用到草稿。请简化描述或选择其他可用模型。',
};

export function authoringFailureMessage(code: string, externalResult: string) {
  if (code === 'AUTHORING_TIMEOUT')
    return '本次操作超过执行期限，草稿与调用记录已保留。请先核对原操作和费用，再决定是否发起新的调用。';
  if (externalResult === 'unknown' || code === 'AUTHORING_RESULT_UNKNOWN')
    return '本次外部执行结果无法确认，草稿与调用记录已保留。请先核对原操作和费用，再决定是否发起新的调用。';
  return (
    knownFailures[code] ??
    '本次操作未完成，草稿已保留。请查看诊断并核对条件或模型配置，再决定是否重新执行。'
  );
}

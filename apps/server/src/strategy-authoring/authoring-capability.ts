import type { AuthoringContent } from '@thesis-ledger/schemas';

/** 明确并行交易代码的确定性能力门禁，不推断模糊名称或用户的隐含意图。 */
export function authoringRequirementCapabilityIssue(quote: string): string | null {
  const codes = new Set(quote.toUpperCase().match(/\b\d{6}\.(?:SZ|SH|BJ)\b/gu) ?? []);
  if (codes.size < 2) return null;
  if (/不(?:会|要)?同时(?:交易|买入|持有)/u.test(quote)) return null;
  const parallel =
    /同时(?:交易|买入|持有)|(?:组合|多标的).*(?:交易|买入|持有)|(?:交易|买入|持有).*(?:两只|两支)/u;
  return parallel.test(quote) ? '首期仅支持单标的，请改写或明确移除并行交易多个代码的要求' : null;
}

export function enforceAuthoringCapabilities(content: AuthoringContent): AuthoringContent {
  return {
    ...content,
    requirements: content.requirements.map((item) =>
      item.state !== 'removed' && authoringRequirementCapabilityIssue(item.quote)
        ? { ...item, state: 'unsupported' }
        : item,
    ),
  };
}

import type { AiExecutionReadModel, AiUsageCompleteness } from '@thesis-ledger/schemas';

type CurrencyTotals = Map<string, number>;

const addCurrency = (totals: CurrencyTotals, currency: string, amount: string) => {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) return;
  totals.set(currency, (totals.get(currency) ?? 0) + parsed);
};

const amountLines = (label: string, totals: CurrencyTotals) =>
  [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([currency, amount]) => `${label} ${currency} ${amount.toFixed(8).replace(/\.?0+$/u, '')}`,
    );

const usageSide = (completeness: AiUsageCompleteness, known: boolean, total: number) => {
  if (completeness === 'legacy_unknown') return '历史未核对';
  if (completeness === 'unknown') return '未知';
  if (completeness === 'partial') return known ? `已报告 ${total.toLocaleString('zh-CN')}` : '未知';
  return total.toLocaleString('zh-CN');
};

export const aiUsageCompletenessLabels: Record<AiUsageCompleteness, string> = {
  reported: '完整报告',
  partial: '部分报告',
  unknown: '未知',
  legacy_unknown: '历史未核对',
};

export const aiContinuationBlockedLabels: Record<
  NonNullable<AiExecutionReadModel['continuationBlockedReason']>,
  string
> = {
  budget_exceeded: '预算已超额；合法结果仍保留，后续生成或回测已停止',
  cost_unknown: '费用无法确认，后续执行已停止',
  cancelled: '任务已取消',
  expired: '绝对执行期限已到',
  capability_revoked: 'Provider 能力已撤销',
};

export type AiExecutionDisplay = {
  completenessLabel: string;
  tokenText: string;
  costLines: string[];
  reservationLines: string[];
  policyLines: string[];
  deadlineText: string;
  generationStatusLabel: string;
  blockedReason: string | null;
};

export const aiExecutionDisplay = (
  execution: AiExecutionReadModel | null | undefined,
  legacy?: { inputTokens?: number; outputTokens?: number },
): AiExecutionDisplay => {
  if (!execution) {
    const hasLegacyValue = Boolean(legacy?.inputTokens || legacy?.outputTokens);
    return {
      completenessLabel: '历史未核对',
      tokenText: hasLegacyValue
        ? `历史兼容值 ${legacy?.inputTokens ?? '未知'} / ${legacy?.outputTokens ?? '未知'}（不可视为完整总量）`
        : '历史未核对',
      costLines: ['历史费用未核对'],
      reservationLines: ['历史记录没有可验证的预留事实'],
      policyLines: ['历史记录没有冻结研究策略'],
      deadlineText: '未记录',
      generationStatusLabel: '历史状态未核对',
      blockedReason: null,
    };
  }

  let inputTotal = 0;
  let outputTotal = 0;
  let inputKnown = false;
  let outputKnown = false;
  const knownCosts: CurrencyTotals = new Map();
  const estimatedCosts: CurrencyTotals = new Map();
  const reservedCosts: CurrencyTotals = new Map();
  let unknownCostRequests = 0;
  let reservedInput = 0;
  let reservedOutput = 0;
  let reservedUnknownCost = 0;

  for (const request of execution.requests) {
    const usage = request.usage;
    if (usage?.inputTokens !== null && usage?.inputTokens !== undefined) {
      inputKnown = true;
      inputTotal += usage.inputTokens;
    }
    if (usage?.outputTokens !== null && usage?.outputTokens !== undefined) {
      outputKnown = true;
      outputTotal += usage.outputTokens;
    }
    const cost = request.cost;
    if (!cost || cost.status === 'unknown') unknownCostRequests += 1;
    else if (cost.amount && cost.currency) {
      addCurrency(
        cost.status === 'known' ? knownCosts : estimatedCosts,
        cost.currency,
        cost.amount,
      );
    }

    const reservationUnconfirmed =
      request.state !== 'completed' ||
      !usage ||
      usage.status !== 'reported' ||
      !cost ||
      cost.status === 'unknown';
    if (!reservationUnconfirmed) continue;
    reservedInput += request.reservation.inputTokens;
    reservedOutput += request.reservation.outputTokens;
    const reservedCost = request.reservation.cost;
    if (reservedCost.amount && reservedCost.currency)
      addCurrency(reservedCosts, reservedCost.currency, reservedCost.amount);
    else reservedUnknownCost += 1;
  }

  const costLines = [
    ...amountLines('已确认', knownCosts),
    ...amountLines('估算（非实付）', estimatedCosts),
  ];
  if (unknownCostRequests > 0) costLines.push(`${unknownCostRequests} 个请求费用未知`);
  if (costLines.length === 0) costLines.push('尚无费用事实');

  const reservationLines: string[] = [];
  if (reservedInput > 0 || reservedOutput > 0)
    reservationLines.push(
      `未确认 Token 预留 ${reservedInput.toLocaleString('zh-CN')} / ${reservedOutput.toLocaleString('zh-CN')}`,
    );
  reservationLines.push(...amountLines('未确认费用预留', reservedCosts));
  if (reservedUnknownCost > 0) reservationLines.push(`${reservedUnknownCost} 个预留金额未知`);
  if (reservationLines.length === 0) reservationLines.push('无未确认预留');

  const policy = execution.frozenPolicy;
  const policyLines: string[] = [];
  if (policy) {
    policyLines.push(
      `最多 ${policy.maxAiCalls} 次请求，输入 / 输出上限 ${policy.maxInputTokens.toLocaleString('zh-CN')} / ${policy.maxOutputTokens.toLocaleString('zh-CN')} Token`,
    );
    policyLines.push(`总期限 ${policy.maxDurationSeconds} 秒，排队与恢复不会重置`);
    if (Number(policy.maxCost) === 0) policyLines.push('费用上限 0，仅允许用户填写为零费用的路由');
    else policyLines.push(`费用上限 ${policy.costCurrency ?? '币种未知'} ${policy.maxCost}`);
  } else policyLines.push('该流程没有研究策略预算，费用边界由实验策略管理');

  const generationStatusLabels: Record<AiExecutionReadModel['generationStatus'], string> = {
    pending: '等待生成',
    complete: '生成完成',
    incomplete: '生成不完整',
    unknown: '外部结果未知',
  };
  return {
    completenessLabel: aiUsageCompletenessLabels[execution.usageCompleteness],
    tokenText: `${usageSide(execution.usageCompleteness, inputKnown, inputTotal)} / ${usageSide(execution.usageCompleteness, outputKnown, outputTotal)}`,
    costLines,
    reservationLines,
    policyLines,
    deadlineText: execution.deadlineAt
      ? new Date(execution.deadlineAt).toLocaleString('zh-CN')
      : '未记录',
    generationStatusLabel: generationStatusLabels[execution.generationStatus],
    blockedReason: execution.continuationBlockedReason
      ? aiContinuationBlockedLabels[execution.continuationBlockedReason]
      : null,
  };
};

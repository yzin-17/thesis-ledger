import { randomUUID } from 'node:crypto';
import type { AiCostFacts, AiExecutionSummary, AiResearchPolicyV1 } from '@thesis-ledger/schemas';
import type { AiProviderPricing } from './ai-provider-pricing.js';

const decimal = (value: number) => value.toFixed(8).replace(/\.?0+$/u, '') || '0';
export const researchInputTokenEstimate = (messages: unknown[]) =>
  Math.max(1, Math.ceil(Buffer.byteLength(JSON.stringify(messages), 'utf8') / 4));

export const researchRequestTotals = (execution: AiExecutionSummary) =>
  execution.requests.reduce(
    (total, request) => {
      const revision = request.usageRevisions.at(-1);
      return {
        calls: total.calls + request.reservation.aiCalls,
        input: total.input + (revision?.usage.inputTokens ?? request.reservation.inputTokens),
        output: total.output + (revision?.usage.outputTokens ?? request.reservation.outputTokens),
        cost: total.cost + Number(revision?.cost.amount ?? request.reservation.cost.amount ?? 0),
      };
    },
    { calls: 0, input: 0, output: 0, cost: 0 },
  );

export function researchRouteCost(
  policy: Pick<AiResearchPolicyV1, 'costCurrency'>,
  pricing: AiProviderPricing,
  inputTokens: number,
  outputTokens: number,
): AiCostFacts | null {
  if (
    pricing.costPer1kInput === undefined ||
    pricing.costPer1kOutput === undefined ||
    !pricing.costCurrency ||
    (policy.costCurrency !== null && pricing.costCurrency !== policy.costCurrency)
  )
    return null;
  return {
    status: 'estimated',
    amount: decimal(
      (inputTokens * pricing.costPer1kInput + outputTokens * pricing.costPer1kOutput) / 1000,
    ),
    currency: pricing.costCurrency,
    source: 'frozen_provider_pricing',
    pricingVersion: pricing.pricingVersion ?? 'unversioned',
  };
}

/** 纯预算准备；真正的请求预留和发送授权仍由既有执行状态仓储原子完成。 */
export function researchSdkReservation(
  execution: AiExecutionSummary,
  policy: AiResearchPolicyV1,
  messages: unknown[],
  pricing: AiProviderPricing,
) {
  const totals = researchRequestTotals(execution);
  const inputTokens = researchInputTokenEstimate(messages);
  const remainingCalls = policy.maxAiCalls - totals.calls;
  if (remainingCalls <= 0 || totals.input + inputTokens > policy.maxInputTokens)
    throw new Error('研究任务累计 Token 或请求次数预算不足');
  const outputTokens = Math.floor((policy.maxOutputTokens - totals.output) / remainingCalls);
  if (outputTokens <= 0) throw new Error('研究任务累计 Token 或请求次数预算不足');
  const reservationCost = researchRouteCost(policy, pricing, inputTokens, outputTokens);
  if (
    !reservationCost ||
    (reservationCost.amount !== null &&
      totals.cost + Number(reservationCost.amount) > Number(policy.maxCost))
  )
    return null;
  return { inputTokens, outputTokens, reservationCost };
}

export function researchSdkRequestPlan(input: {
  execution: AiExecutionSummary;
  policy: AiResearchPolicyV1;
  messages: unknown[];
  provider: string;
  model: string;
  configurationFingerprint: string;
  pricing: AiProviderPricing;
}) {
  const pending = input.execution.requests.find(
    (request) =>
      request.state === 'prepared' &&
      !request.error &&
      request.reservation.provider === input.provider &&
      request.reservation.model === input.model &&
      request.reservation.configurationFingerprint === input.configurationFingerprint,
  );
  if (pending)
    return {
      requestId: pending.requestId,
      reservation: pending.reservation,
      alreadyPrepared: true,
    };
  const budget = researchSdkReservation(
    input.execution,
    input.policy,
    input.messages,
    input.pricing,
  );
  if (!budget) return null;
  return {
    requestId: randomUUID(),
    alreadyPrepared: false,
    reservation: {
      aiCalls: 1 as const,
      inputTokens: budget.inputTokens,
      outputTokens: budget.outputTokens,
      cost: budget.reservationCost,
      provider: input.provider,
      model: input.model,
      configurationFingerprint: input.configurationFingerprint,
    },
  };
}

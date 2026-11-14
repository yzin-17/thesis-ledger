import { Prisma } from '@prisma/client';
import type { ArenaLiveBudget } from '@thesis-ledger/schemas';

interface CallLimitsInput {
  inputEstimate: number;
  maxInputTokens: number | null;
  maxOutputTokens: number | null;
  inputPrice: number;
  outputPrice: number;
  agent: ArenaLiveBudget;
  match: ArenaLiveBudget;
  upstreamOutput: boolean;
}

// 与输入门禁沿用相同的 UTF-8 字节保守估算；不限额维度不使用占位上限。
export function planLiveCall(input: CallLimitsInput) {
  if (input.maxInputTokens !== null && input.inputEstimate > input.maxInputTokens)
    throw new Error('input_limit');
  const inputTokens = input.maxInputTokens ?? input.inputEstimate;
  const inputCost = new Prisma.Decimal(input.inputPrice).times(inputTokens).times(1000);
  const outputCost = new Prisma.Decimal(input.outputPrice).times(1000);
  let outputTokens = input.maxOutputTokens;
  for (const [remaining, reason] of [
    [input.agent, 'participant_budget'],
    [input.match, 'competition_budget'],
  ] as const) {
    validateInputReservation(remaining, inputTokens, inputCost, reason);
    if (input.maxOutputTokens !== null) continue;
    const bounds: number[] = [];
    if (remaining.tokens !== null) bounds.push(remaining.tokens - inputTokens);
    if (remaining.costMicros !== null && outputCost.greaterThan(0))
      bounds.push(
        new Prisma.Decimal(remaining.costMicros)
          .minus(inputCost)
          .div(outputCost)
          .floor()
          .toNumber(),
      );
    for (const bound of bounds) {
      if (bound < 1) throw new Error(reason);
      outputTokens = outputTokens === null ? bound : Math.min(outputTokens, bound);
    }
  }
  if (
    outputTokens !== null &&
    (!Number.isSafeInteger(outputTokens) || !Number.isSafeInteger(inputTokens + outputTokens))
  )
    throw new Error('request_limit_unrepresentable');
  if (input.upstreamOutput && outputTokens !== null) throw new Error('output_limit_unsupported');
  const amount = {
    requests: 1,
    tokens: inputTokens + (outputTokens ?? 0),
    costMicros: inputCost
      .plus(outputCost.times(outputTokens ?? 0))
      .ceil()
      .toNumber(),
  };
  if (!Number.isSafeInteger(amount.costMicros)) throw new Error('request_limit_unrepresentable');
  return { amount, inputTokens, outputTokens };
}

function validateInputReservation(
  remaining: ArenaLiveBudget,
  inputTokens: number,
  inputCost: Prisma.Decimal,
  reason: string,
) {
  if (remaining.requests !== null && remaining.requests < 1) throw new Error(reason);
  if (remaining.tokens !== null && remaining.tokens < inputTokens + 1) throw new Error(reason);
  if (remaining.costMicros !== null && inputCost.ceil().greaterThan(remaining.costMicros))
    throw new Error(reason);
}

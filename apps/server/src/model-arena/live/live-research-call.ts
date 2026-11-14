import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  aiGenerationContracts,
  arenaLiveProtocolSchema,
  type ArenaBudget,
} from '@thesis-ledger/schemas';
import { AiProviderRegistry } from '../../ai/provider-registry.js';
import {
  AiSdkGenerationAdapter,
  AiSdkGenerationError,
} from '../../ai/ai-sdk-generation.adapter.js';
import { prepareModelReceipt } from '../../ai/ai-model-receipt.js';
import { aiRouteReasoningFields } from '../../ai/ai-route-reasoning-options.js';
import { aiProviderTestSuccessFacts } from '../../ai/ai-provider-test-facts.js';
import { sanitize } from '../../ai/ai-sdk-generation-facts.js';
import { PrismaService } from '../../platform/prisma.service.js';
import { liveAgents, liveMatch, liveRemaining, type LiveCycleRow } from './live-storage.js';
import { LiveResearchBudget } from './live-research-budget.js';
import { planLiveCall } from './live-call-limits.js';
import { liveCallFailureDiagnostics } from './live-call-diagnostics.js';
import { liveCallCostMicros } from './live-call-cost.js';

@Injectable()
export class LiveResearchCall {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AiProviderRegistry) private readonly registry: AiProviderRegistry,
    @Inject(AiSdkGenerationAdapter) private readonly sdk: Pick<AiSdkGenerationAdapter, 'generate'>,
    @Inject(LiveResearchBudget) private readonly budget: LiveResearchBudget,
  ) {}
  async generate(
    id: string,
    attempt: number,
    messages: { role: string; content: string }[],
    signal?: AbortSignal,
  ) {
    const [cycle] = await this.db.$queryRaw<
      LiveCycleRow[]
    >`SELECT * FROM "ArenaLiveCycle" WHERE id=${id}::uuid`;
    if (!activeResearchCycle(cycle, attempt)) throw new Error('cycle_not_active');
    signal?.throwIfAborted();
    const match = await liveMatch(this.db, cycle.matchId);
    const p = arenaLiveProtocolSchema.parse(match.protocol);
    const agent = (await liveAgents(this.db, match.id)).find((a) => a.id === cycle.agentId)!;
    const binding = p.entrants.find(
      (e) => e.providerId === agent.providerId && e.model === agent.model,
    )!;
    const contract = aiGenerationContracts.arenaLiveResearch;
    const route = this.registry.strictReadyContract({
      providerId: binding.providerId,
      model: binding.model,
      contract: contract.ref,
      budgetAuthorized: true,
    });
    const { runtime, price, inputPrice, outputPrice } = liveCallPricing(
      route,
      binding.model,
      p.budgetCurrency,
    );
    const limits = planLiveCall({
      inputEstimate: Buffer.byteLength(JSON.stringify(messages), 'utf8') + 256,
      maxInputTokens: binding.maxInputTokens,
      maxOutputTokens: binding.maxOutputTokens,
      inputPrice,
      outputPrice,
      agent: liveRemaining(agent.remaining),
      match: liveRemaining(match.remaining),
      upstreamOutput: route.execution.requestOptions?.outputTokenLimit === 'upstream',
    });
    const identity = await prepareModelReceipt(runtime, binding.model);
    signal?.throwIfAborted();
    const requestId = randomUUID();
    await this.budget.reserve(id, attempt, requestId, limits.amount, {
      messages,
      contract: contract.ref,
      requestedModel: binding.model,
      budgetCurrency: p.budgetCurrency,
      limits: {
        input: binding.maxInputTokens,
        output: binding.maxOutputTokens,
        reservedInput: limits.inputTokens,
        effectiveOutput: limits.outputTokens,
      },
    });
    let used: ArenaBudget | null = null;
    let receipt: Record<string, unknown> = {};
    try {
      const ms = cycle.deadlineAt ? cycle.deadlineAt.getTime() - Date.now() : null;
      if (ms !== null && ms <= 0) {
        used = { requests: 0, tokens: 0, costMicros: 0 };
        throw new Error('cycle_deadline');
      }
      if (signal?.aborted) {
        used = { requests: 0, tokens: 0, costMicros: 0 };
        signal.throwIfAborted();
      }
      const signals = liveResearchSignals(signal, ms);
      const result = await this.sdk.generate(
        liveResearchRequest({ requestId, route, binding, runtime, messages, limits, ms, signals }),
      );
      const accounting = aiProviderTestSuccessFacts(
        { modelPricing: { [binding.model]: price } },
        binding.model,
        result,
      );
      const costMicros = liveCallCostMicros(accounting.cost, p.budgetCurrency);
      used = knownLiveCallUsage(result.usage, costMicros);
      const proof = await identity.verify(result.actualModel);
      receipt = {
        actualModel: result.actualModel,
        modelIdentity: proof,
        usage: result.usage,
        cost: accounting.cost,
        output: result.output,
      };
      if (!proof.accepted) throw new Error('model_identity_unverified');
      if (!used) throw new Error('unknown_usage');
      return result.output;
    } catch (error) {
      if (error instanceof AiSdkGenerationError) {
        receipt = {
          error: error.fact,
          usage: error.usage,
          diagnostics: liveCallFailureDiagnostics(error, contract.schema, runtime.apiKey),
        };
        if (error.fact.externalResult === 'not_sent')
          used = { requests: 0, tokens: 0, costMicros: 0 };
        else if (error.fact.externalResult === 'rejected_before_generation')
          used = { requests: 1, tokens: 0, costMicros: 0 };
        else {
          const facts = aiProviderTestSuccessFacts(
            { modelPricing: { [binding.model]: price } },
            binding.model,
            error.completion ?? {
              actualModel: null,
              usage: error.usage,
              providerCost: null,
              providerCostCurrency: null,
            },
          );
          const costMicros = liveCallCostMicros(facts.cost, p.budgetCurrency);
          used = knownLiveCallUsage(facts.usage, costMicros);
        }
        throw new Error(used ? 'model_output_invalid' : 'unknown_usage');
      }
      receipt.error = sanitize(error);
      if (!used) throw new Error('unknown_usage');
      throw error;
    } finally {
      await this.budget.settle(id, requestId, used, receipt);
    }
  }
}

type LiveRoute = ReturnType<AiProviderRegistry['strictReadyContract']>;

function activeResearchCycle(
  cycle: LiveCycleRow | undefined,
  attempt: number,
): cycle is LiveCycleRow & { leaseUntil: Date } {
  return !(
    !cycle ||
    cycle.state !== 'running' ||
    cycle.attempt !== attempt ||
    !cycle.leaseUntil ||
    cycle.leaseUntil.getTime() <= Date.now()
  );
}

function liveCallPricing(route: LiveRoute, model: string, budgetCurrency: string) {
  const runtime = route.provider.sdkRuntime?.(),
    price = route.provider.metadata?.modelPricing?.[model];
  const zeroRate = price?.costPer1kInput === 0 && price.costPer1kOutput === 0;
  if (
    !runtime ||
    !price ||
    !price.costCurrency ||
    (price.costCurrency !== budgetCurrency && !zeroRate) ||
    price.costPer1kInput == null ||
    price.costPer1kOutput == null
  )
    throw new Error('unknown_pricing');

  return { runtime, price, inputPrice: price.costPer1kInput, outputPrice: price.costPer1kOutput };
}

function liveResearchRequest(i: {
  requestId: string;
  route: LiveRoute;
  binding: ReturnType<typeof arenaLiveProtocolSchema.parse>['entrants'][number];
  runtime: ReturnType<typeof liveCallPricing>['runtime'];
  messages: { role: string; content: string }[];
  limits: ReturnType<typeof planLiveCall>;
  ms: number | null;
  signals: AbortSignal[];
}) {
  const { requestId, route, binding, runtime, messages, limits, ms, signals } = i;
  const contract = aiGenerationContracts.arenaLiveResearch;
  return {
    requestId,
    adapter: route.execution.adapter,
    providerId: binding.providerId,
    baseURL: runtime.baseURL,
    apiKey: runtime.apiKey,
    authMode: runtime.authMode ?? 'api_key',
    model: binding.model,
    messages,
    contract: contract.ref,
    schema: contract.schema,
    mode: route.execution.mode,
    transport: 'single' as const,
    ...(limits.outputTokens === null ? {} : { maxOutputTokens: limits.outputTokens }),
    ...(route.execution.compatibilityExtensionProfile
      ? { compatibilityExtensionProfile: route.execution.compatibilityExtensionProfile }
      : {}),
    ...aiRouteReasoningFields(route.execution),
    ...(route.execution.requestOptions ? { requestOptions: route.execution.requestOptions } : {}),
    timeout: ms === null ? {} : { totalMs: ms },
    signal: signals.length ? AbortSignal.any(signals) : new AbortController().signal,
  };
}

function knownLiveCallUsage(
  usage: ReturnType<typeof aiProviderTestSuccessFacts>['usage'],
  costMicros: number | null,
): ArenaBudget | null {
  if (usage.inputTokens !== null && usage.outputTokens !== null && costMicros !== null)
    return { requests: 1, tokens: usage.inputTokens + usage.outputTokens, costMicros };

  return null;
}

function liveResearchSignals(signal: AbortSignal | undefined, ms: number | null) {
  const signals = signal ? [signal] : [];
  if (ms !== null) signals.push(AbortSignal.timeout(ms));

  return signals;
}

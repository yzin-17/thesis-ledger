import { assertGenerationSchemaPrompt } from '../ai/ai-generation-schema-prompt.js';
import { aiRouteReasoningFields } from '../ai/ai-route-reasoning-options.js';
import { HttpException, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { AUTHORING_LIMITS, type AiCostFacts, type AiUsageFacts } from '@thesis-ledger/schemas';
import type { AiInvocationStore } from '../ai/ai-invocation.store.js';
import type { AiProviderService } from '../ai/ai-provider.service.js';
import type { AiProviderRegistry } from '../ai/provider-registry.js';
import {
  AiSdkGenerationError,
  type AiSdkGenerationAdapter,
  type AiSdkGenerationResult,
} from '../ai/ai-sdk-generation.adapter.js';
import type { AiProvider } from '../ai/contracts.js';
import type {
  AuthoringOperation,
  AuthoringOperationRepository,
} from './authoring-operation.repository.js';
import {
  savedAuthoringContract,
  authoringCost,
  authoringPricingFingerprint,
  unknownAuthoringCost,
} from './authoring-model-policy.js';
import { authoringMessages } from './authoring-prompt.js';
import { authoringOperationSchema } from './authoring-operation-schema.js';
import { mergeAuthoringAnalysis } from './authoring-analysis.js';
import { validateAuthoringGeneration } from './authoring-semantics.js';
import { validateAuthoringModification } from './authoring-modification.js';
import { authoringValidationIssues } from './authoring-diagnostics.js';
import { StrategyCompilationError, compileBacktestStrategy } from '../backtest/backtest-strategy-compiler.js';

type Dependencies = {
  operations: AuthoringOperationRepository;
  providers: AiProviderService;
  registry: AiProviderRegistry;
  audit: AiInvocationStore;
  sdk: AiSdkGenerationAdapter;
};
type AttemptResult = {
  externalResult: 'not_sent' | 'received' | 'unknown';
  usage: AiUsageFacts | null;
  cost: AiCostFacts;
  outputText: string | null;
  errorCode: string | null;
  compilation?: ReturnType<typeof compileBacktestStrategy>;
};
const fingerprint = (value: string) => createHash('sha256').update(value).digest('hex');
export function authoringFailureCode(error: unknown, signalReason?: unknown): string {
  if (error instanceof AiSdkGenerationError) {
    if (
      error.fact.code === 'cancelled' &&
      signalReason instanceof Error &&
      ['AUTHORING_LEASE_LOST', 'AUTHORING_EXECUTOR_STOPPED'].includes(signalReason.message)
    )
      return 'AUTHORING_RESULT_UNKNOWN';
    if (
      error.fact.code === 'cancelled' &&
      signalReason instanceof Error &&
      signalReason.name === 'TimeoutError'
    )
      return 'AUTHORING_TIMEOUT';
    return `AUTHORING_${error.fact.code.toUpperCase()}`;
  }
  if (error instanceof ZodError) return 'AUTHORING_SCHEMA_INVALID';
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (
      response &&
      typeof response === 'object' &&
      'code' in response &&
      typeof response.code === 'string'
    )
      return response.code;
    return 'AUTHORING_EXECUTION_FAILED';
  }
  if (error instanceof Error && /^AUTHORING_[A-Z_]+$/u.test(error.message)) return error.message;
  return 'AUTHORING_EXECUTION_FAILED';
}

/** 单次 Provider 调用及其事实；租约编排和业务终态由 Executor 持有。 */
export class AuthoringAttemptRunner {
  private readonly logger = new Logger(AuthoringAttemptRunner.name);
  private readonly requestId = randomUUID();
  private prepared = false;
  private dispatched = false;
  private factWritten = false;
  private provider: AiProvider | null = null;
  private dispatchSignal: AbortSignal | null = null;
  private readonly result: AttemptResult = {
    externalResult: 'not_sent',
    usage: null,
    cost: unknownAuthoringCost(),
    outputText: null,
    errorCode: null,
  };
  constructor(
    private readonly operation: AuthoringOperation,
    private readonly signal: AbortSignal,
    private readonly dependencies: Dependencies,
  ) {}
  async run() {
    try {
      await this.generate();
    } catch (error) {
      await this.recordFailure(error);
    }
    return this.result;
  }
  private async prepare() {
    const { operation } = this;
    const selection = operation.input.selection;
    await this.dependencies.audit.prepare({
      requestId: this.requestId,
      consumer: 'strategy_authoring',
      referenceId: operation.id,
      ownerId: operation.ownerId,
      executionAttempt: operation.attempt,
      providerId: selection.providerId,
      requestedModel: selection.model,
      inputFingerprint: fingerprint(JSON.stringify(operation.input)),
    });
    this.prepared = true;
    await this.dependencies.providers.refreshRegistry();
    const contract = savedAuthoringContract(selection);
    const route = this.dependencies.registry.strictReadyContract({
      providerId: selection.providerId,
      model: selection.model,
      contract: contract.ref,
      budgetAuthorized: true,
    });
    this.provider = route.provider;
    if (
      route.execution.liveValidation.status !== 'passed' ||
      route.execution.readiness.configurationFingerprint !== selection.configurationFingerprint ||
      authoringPricingFingerprint(route.provider, selection.model) !== selection.pricingFingerprint
    )
      throw new Error('AUTHORING_MODEL_CONFIGURATION_CHANGED');
    const runtime = route.provider.sdkRuntime?.();
    if (!runtime) throw new Error('AUTHORING_MODEL_UNAVAILABLE');
    const messages = authoringMessages(operation);
    const schema = authoringOperationSchema(operation);
    if (route.execution.mode === 'json_validated') assertGenerationSchemaPrompt(schema, messages);
    if (Buffer.byteLength(JSON.stringify(messages), 'utf8') > AUTHORING_LIMITS.snapshotBytes)
      throw new Error('AUTHORING_INPUT_TOO_LARGE');
    return { contract, route, runtime, messages, schema };
  }
  private async remainingLease() {
    const { operation } = this;
    const remaining = operation.startedAt!.getTime() + AUTHORING_LIMITS.deadlineMs - Date.now();
    if (
      remaining <= 0 ||
      this.signal.aborted ||
      !(await this.dependencies.operations.renew(
        operation.ownerId,
        operation.id,
        operation.attempt,
      ))
    )
      throw new Error('AUTHORING_LEASE_LOST');
    return remaining;
  }
  private async generate() {
    const { contract, route, runtime, messages, schema } = await this.prepare();
    const selection = this.operation.input.selection;
    await this.remainingLease();
    await this.dependencies.audit.append(this.requestId, {
      eventKey: randomUUID(),
      kind: 'dispatching',
      actualModel: null,
      usage: null,
      cost: unknownAuthoringCost(),
      errorCode: null,
      outputFingerprint: null,
    });
    this.dispatched = true;
    const remaining = await this.remainingLease();
    this.result.externalResult = 'unknown';
    this.dispatchSignal = AbortSignal.any([this.signal, AbortSignal.timeout(remaining)]);
    const generated = await this.dependencies.sdk.generate<unknown>({
      requestId: this.requestId,
      adapter: route.execution.adapter,
      ...(route.execution.compatibilityExtensionProfile
        ? { compatibilityExtensionProfile: route.execution.compatibilityExtensionProfile }
        : {}),
      providerId: selection.providerId,
      model: selection.model,
      baseURL: runtime.baseURL,
      apiKey: runtime.apiKey,
      authMode: runtime.authMode ?? 'api_key',
      messages,
      contract: contract.ref,
      schema,
      mode: route.execution.mode,
      ...aiRouteReasoningFields(route.execution),
      ...(route.execution.requestOptions ? { requestOptions: route.execution.requestOptions } : {}),
      transport: 'stream',
      maxOutputTokens: AUTHORING_LIMITS.outputTokens,
      timeout: {
        totalMs: remaining,
        firstChunkMs: Math.min(route.execution.firstOutputTimeoutMs ?? 30_000, remaining),
        chunkMs: Math.min(route.execution.outputIdleTimeoutMs ?? 30_000, remaining),
      },
      signal: this.dispatchSignal,
    });
    await this.recordReceived(generated, route.provider);
    this.validate(generated.output);
  }
  private async recordReceived(generated: AiSdkGenerationResult<unknown>, provider: AiProvider) {
    this.result.externalResult = 'received';
    this.result.usage = generated.usage;
    this.result.cost = authoringCost(
      provider,
      this.operation.input.selection.model,
      generated.usage,
      generated.providerCost,
      generated.providerCostCurrency,
    );
    const text = generated.rawOutputText ?? JSON.stringify(generated.output);
    await this.dependencies.audit.append(this.requestId, {
      eventKey: randomUUID(),
      kind: 'received',
      actualModel: generated.actualModel,
      usage: this.result.usage,
      cost: this.result.cost,
      errorCode: null,
      outputFingerprint: fingerprint(text),
    });
    this.factWritten = true;
    if (Buffer.byteLength(text, 'utf8') > AUTHORING_LIMITS.outputBytes)
      throw new Error('AUTHORING_OUTPUT_TOO_LARGE');
    if (
      generated.actualModel !== null &&
      generated.actualModel !== this.operation.input.selection.model
    )
      throw new Error('AUTHORING_MODEL_MISMATCH');
    this.result.outputText = text;
  }
  private validate(output: unknown) {
    const { content, selection } = this.operation.input;
    if (selection.kind !== 'analyze' && selection.modificationTarget !== 'entryOrderValidity') {
      const wire = output as { proposal?: unknown };
      this.result.compilation = compileBacktestStrategy(((wire?.proposal ?? output) as { definition?: unknown })?.definition);
      if (!this.result.compilation.definition) throw new StrategyCompilationError(this.result.compilation);
    }
    if (selection.kind === 'analyze')
      mergeAuthoringAnalysis(content, this.operation.revision, output);
    else {
      const validated = selection.kind === 'modify' ? validateAuthoringModification(content, selection, output)
        : validateAuthoringGeneration(content, output);
      if ('compilation' in validated && validated.compilation) this.result.compilation = validated.compilation;
    }
  }
  private recordDiagnostic(error: unknown) {
    const issues = authoringValidationIssues(error);
    if (issues.length)
      this.logger.warn({ operationId: this.operation.id, validationIssues: issues });
    if (this.result.errorCode === 'AUTHORING_EXECUTION_FAILED' && error instanceof Error)
      this.logger.warn({
        operationId: this.operation.id,
        errorType: error.name,
        frames:
          error.stack
            ?.split('\n')
            .filter((line) => /^\s+at /u.test(line))
            .slice(0, 3)
            .map((line) => line.slice(0, 240)) ?? [],
      });
  }
  private async recordFailure(error: unknown) {
    if (error instanceof StrategyCompilationError) this.result.compilation = error.compilation;
    this.result.errorCode = authoringFailureCode(error, this.dispatchSignal?.reason);
    this.recordDiagnostic(error);
    if (error instanceof AiSdkGenerationError) {
      if (error.completion?.rawOutputText !== undefined) {
        this.result.outputText = error.completion.rawOutputText;
        let raw: unknown;
        try { raw = JSON.parse(this.result.outputText); } catch { raw = undefined; }
        const wire = raw as { proposal?: unknown } | undefined;
        this.result.compilation = compileBacktestStrategy(((wire?.proposal ?? raw) as { definition?: unknown } | undefined)?.definition);
      }
      if (error.fact.externalResult === 'not_sent') this.result.externalResult = 'not_sent';
      else if (error.fact.externalResult === 'complete') this.result.externalResult = 'received';
      else this.result.externalResult = 'unknown';
      this.result.usage = error.usage;
      if (this.result.externalResult !== 'not_sent' && this.provider)
        this.result.cost = authoringCost(
          this.provider,
          this.operation.input.selection.model,
          error.usage,
          error.completion?.providerCost ?? null,
          error.completion?.providerCostCurrency ?? null,
        );
    }
    if (this.prepared && !this.factWritten) {
      await this.dependencies.audit.append(this.requestId, {
        eventKey: randomUUID(),
        kind: this.dispatched ? this.result.externalResult : 'not_sent',
        actualModel:
          error instanceof AiSdkGenerationError ? (error.completion?.actualModel ?? null) : null,
        usage: this.result.externalResult === 'not_sent' ? null : this.result.usage,
        cost: this.result.cost,
        errorCode: this.result.errorCode,
        outputFingerprint: null,
      });
    }
  }
}

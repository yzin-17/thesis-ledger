import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import type { AiGenerationMode } from '@thesis-ledger/schemas';
import type { ProviderConfigService } from '../providers/provider-config.service.js';
import type { ProviderHealthService, ProviderState } from '../providers/provider-health.service.js';
import { AiSdkGenerationError, type AiSdkGenerationAdapter } from './ai-sdk-generation.adapter.js';
import {
  errorCodeFor,
  sanitizeAiProviderError,
  type AiProviderTestKind,
  type AiProviderTestPurpose,
  type AiProviderTestResult,
  type AiProviderTestStatus,
  type AiProviderExecutionRouteInput,
} from './ai-provider.contracts.js';
import type { AiTestRuntimeInput } from './ai-provider-test-runtime.js';
import { aiTestRuntimeFingerprint } from './ai-provider-test-fingerprint.js';
import { aiProviderTestAuditDetails } from './ai-provider-test-audit.js';
import {
  aiProviderTestSuccessFacts,
  aiProviderTestFailureFacts,
} from './ai-provider-test-facts.js';
import { aiRouteReasoningFields } from './ai-route-reasoning-options.js';
import { modelRequestOptionsFields } from './ai-model-request-options.js';
import { runProviderConnectionTest } from './provider-connection-test.js';
import { probeTimeoutOverrides } from './ai-provider-probe-timeout.js';
import { generationPricingError } from './ai-provider-test-pricing.js';
import { VALIDATION_DURATION_SECONDS } from './ai-provider-validation-policy.js';

interface DraftTest {
  name: string;
  fingerprint: string;
  credentialHash: string;
  credential: string;
  model?: string;
  testKind: AiProviderTestKind;
  purpose?: AiProviderTestPurpose;
  mode?: AiGenerationMode;
  latencyMs: number;
  checkedAt: Date;
  expiresAt: number;
}
const DRAFT_TTL_MS = 5 * 60 * 1000;

/**
 * AI 链路判断「慢」的延迟阈值。`ProviderHealthService` 的默认 3 秒是为轻量连接测试定的，
 * 而一次成功的用途探针实测 43～103 秒（本地推理模型的思考 token 与正文共用输出预算）——
 * 沿用默认会把每一次成功的慢生成都记成 degraded，`ProviderConfig.health` 永远停在 degraded。
 * 这里按授权给验证的总时长判慢：跑超授权预算的请求根本不可能成功返回。
 */
export const AI_GENERATION_SLOW_AFTER_MS = VALIDATION_DURATION_SECONDS * 1_000;

export class AiProviderTests {
  private readonly drafts = new Map<string, DraftTest>();
  private readonly draftTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly activeTests = new Map<
    string,
    { provider: string; controller: AbortController }
  >();

  constructor(
    private readonly configs: ProviderConfigService,
    private readonly health: ProviderHealthService,
    private readonly sdk: AiSdkGenerationAdapter,
  ) {}

  cancelTest(name: string, requestId: string) {
    const active = this.activeTests.get(requestId);
    if (!active || active.provider !== name) return { name, requestId, cancelled: false };
    active.controller.abort();
    return { name, requestId, cancelled: true };
  }

  async executeTest(
    input: AiTestRuntimeInput,
    persist: boolean,
    fingerprint?: string,
  ): Promise<AiProviderTestResult> {
    const prepared = prepareProviderTest(input);
    if ('status' in prepared) return prepared;
    const { model, purposeRoute, purpose, mode } = prepared;
    const started = Date.now();
    const requestId = input.requestId ?? randomUUID();
    if (this.activeTests.has(requestId))
      throw new ConflictException('测试请求正在进行中，请勿重复提交');
    const controller = new AbortController();
    this.activeTests.set(requestId, { provider: input.name, controller });
    const context: ProviderTestExecution = {
      ...prepared,
      input,
      persist,
      fingerprint,
      started,
      requestId,
      controller,
    };
    try {
      const { result, latencyMs } = await runProviderConnectionTest({
        sdk: this.sdk,
        adapter: input.adapter,
        ...(input.compatibilityExtensionProfile === undefined
          ? {}
          : { compatibilityExtensionProfile: input.compatibilityExtensionProfile }),
        providerId: input.name,
        baseURL: input.baseUrl,
        authMode: input.authMode,
        apiKey: input.credential,
        model,
        ...modelRequestOptionsFields(input.modelDefaults, model),
        timeoutMs: input.timeoutMs,
        requestId,
        signal: controller.signal,
        ...(purpose === undefined ? {} : { purpose }),
        ...(purposeRoute ? { contractRef: purposeRoute.contract } : {}),
        mode,
        ...aiRouteReasoningFields(purposeRoute),
        ...probeTimeoutOverrides(input, purposeRoute),
      });
      if (controller.signal.aborted) throw new Error('AI provider test cancelled');
      return await this.testSucceeded(context, result, latencyMs);
    } catch (error) {
      return await this.testFailed(context, error);
    } finally {
      if (this.activeTests.get(requestId)?.controller === controller)
        this.activeTests.delete(requestId);
    }
  }

  private async testSucceeded(
    context: ProviderTestExecution,
    result: Awaited<ReturnType<typeof runProviderConnectionTest>>['result'],
    latencyMs: number,
  ): Promise<AiProviderTestResult> {
    const { input, persist, fingerprint, model, purpose, mode, credentialConfigured, requestId } =
      context;
    const facts = aiProviderTestSuccessFacts(input, model, result);
    if (!persist) {
      const testToken = randomUUID();
      this.drafts.set(testToken, {
        name: input.name,
        fingerprint: fingerprint ?? aiTestRuntimeFingerprint(input),
        credentialHash: this.credentialHash(input.credential),
        credential: input.credential,
        ...(input.testModel === undefined ? {} : { model: input.testModel }),
        testKind: input.testKind,
        latencyMs,
        checkedAt: new Date(),
        expiresAt: Date.now() + DRAFT_TTL_MS,
      });
      const timer = setTimeout(() => this.deleteDraft(testToken), DRAFT_TTL_MS);
      timer.unref?.();
      this.draftTimers.set(testToken, timer);
      return {
        name: input.name,
        status: 'healthy',
        message: '测试成功',
        credentialConfigured,
        authMode: input.authMode,
        testKind: input.testKind,
        ...(purpose === undefined ? {} : { purpose }),
        mode,
        model,
        latencyMs,
        requestId,
        ...facts,
        testToken,
      };
    }
    const health = await this.recordSavedHealth(
      input.name,
      true,
      latencyMs,
      new Date(),
      undefined,
      aiProviderTestAuditDetails(input, model, facts),
    );
    return {
      ...health,
      name: input.name,
      message: '测试成功',
      credentialConfigured,
      authMode: input.authMode,
      testKind: input.testKind,
      ...(purpose === undefined ? {} : { purpose }),
      mode,
      model,
      latencyMs,
      requestId,
      ...facts,
    };
  }

  private async testFailed(
    context: ProviderTestExecution,
    error: unknown,
  ): Promise<AiProviderTestResult> {
    const {
      input,
      persist,
      model,
      purpose,
      mode,
      credentialConfigured,
      controller,
      requestId,
      started,
    } = context;
    const latencyMs = Date.now() - started;
    const facts = aiProviderTestFailureFacts(error);
    if (
      controller.signal.aborted &&
      ((error instanceof AiSdkGenerationError && error.fact.code === 'cancelled') ||
        error === controller.signal.reason)
    ) {
      const message = '测试已取消；外部结果未知，未将费用或用量记为零';
      if (!persist)
        return {
          name: input.name,
          status: 'cancelled',
          message,
          credentialConfigured,
          authMode: input.authMode,
          testKind: input.testKind,
          ...(purpose === undefined ? {} : { purpose }),
          mode,
          model,
          latencyMs,
          requestId,
          ...facts,
          errorCode: 'cancelled',
        };
      const health = await this.recordSavedTestHistory(
        input.name,
        latencyMs,
        new Date(),
        aiProviderTestAuditDetails(input, model, facts, 'cancelled', 'cancelled'),
      );
      return {
        ...health,
        name: input.name,
        message,
        credentialConfigured,
        authMode: input.authMode,
        testKind: input.testKind,
        ...(purpose === undefined ? {} : { purpose }),
        mode,
        model,
        latencyMs,
        requestId,
        ...facts,
        errorCode: 'cancelled',
      };
    }
    const errorCode = error instanceof AiSdkGenerationError ? error.fact.code : errorCodeFor(error);
    const message = sanitizeAiProviderError(error, input.credential);
    if (!persist)
      return {
        name: input.name,
        status: 'down',
        message,
        credentialConfigured,
        authMode: input.authMode,
        testKind: input.testKind,
        ...(purpose === undefined ? {} : { purpose }),
        mode,
        model,
        latencyMs,
        requestId,
        ...facts,
        errorCode,
      };
    const health = await this.recordSavedHealth(
      input.name,
      false,
      latencyMs,
      new Date(),
      errorCode,
      aiProviderTestAuditDetails(input, model, facts, errorCode),
    );
    return {
      name: input.name,
      status: health.status,
      message,
      credentialConfigured,
      authMode: input.authMode,
      testKind: input.testKind,
      ...(purpose === undefined ? {} : { purpose }),
      mode,
      model,
      latencyMs,
      requestId,
      ...facts,
      errorCode,
      healthCheck: health.healthCheck,
    };
  }

  async recordSavedHealth(
    name: string,
    success: boolean,
    latencyMs: number,
    checkedAt = new Date(),
    errorCode?: string,
    details?: Prisma.InputJsonValue,
    slowAfterMs = AI_GENERATION_SLOW_AFTER_MS,
  ) {
    const state = await this.health.record(
      name,
      success,
      latencyMs,
      errorCode,
      checkedAt,
      'manual',
      details,
      slowAfterMs,
    );
    const config = await this.configs.findStored(name);
    if (config) await this.configs.setHealth(name, state.state);
    return {
      status: state.state as AiProviderTestStatus,
      healthCheck: {
        state: state.state as ProviderState,
        latencyMs: state.latencyMs,
        checkedAt: state.checkedAt.toISOString(),
        source: 'manual' as const,
      },
    };
  }

  private async recordSavedTestHistory(
    name: string,
    latencyMs: number,
    checkedAt: Date,
    details: Prisma.InputJsonValue,
  ) {
    const current = await this.health.get(name).catch(() => null);
    const state: ProviderState =
      current?.state === 'healthy' || current?.state === 'degraded' || current?.state === 'down'
        ? current.state
        : 'degraded';
    if (typeof this.health.recordHistory === 'function')
      await this.health.recordHistory(
        name,
        state,
        latencyMs,
        'cancelled',
        checkedAt,
        'manual',
        details,
      );
    return {
      status: 'cancelled' as const,
      healthCheck: {
        state,
        latencyMs,
        checkedAt: checkedAt.toISOString(),
        source: 'manual' as const,
      },
    };
  }

  consumeDraft(
    token: string | undefined,
    name: string,
    fingerprint: string,
    credential?: string,
    allowTargeted = false,
  ) {
    if (!token) return undefined;
    const record = this.drafts.get(token);
    this.deleteDraft(token);
    if (!record || record.name !== name || record.expiresAt <= Date.now())
      throw new BadRequestException('草稿测试令牌无效或已过期');
    if (record.fingerprint !== fingerprint)
      throw new BadRequestException('草稿配置已变化，请重新测试连接');
    if (!allowTargeted && record.model !== undefined)
      throw new BadRequestException('保存前请使用配置级测试连接，不能复用指定模型测试令牌');
    if (credential && this.credentialHash(credential) !== record.credentialHash)
      throw new BadRequestException('草稿 API Key 已变化，请重新测试连接');
    return record;
  }

  private deleteDraft(token: string) {
    this.drafts.delete(token);
    const timer = this.draftTimers.get(token);
    if (timer) clearTimeout(timer);
    this.draftTimers.delete(token);
  }

  private credentialHash(credential: string) {
    return createHash('sha256').update(credential, 'utf8').digest('hex');
  }
}

type PreparedProviderTest = {
  credentialConfigured: boolean;
  model: string;
  purposeRoute: AiProviderExecutionRouteInput | undefined;
  purpose: AiTestRuntimeInput['purpose'];
  mode: AiGenerationMode;
};
type ProviderTestExecution = PreparedProviderTest & {
  input: AiTestRuntimeInput;
  persist: boolean;
  fingerprint: string | undefined;
  started: number;
  requestId: string;
  controller: AbortController;
};

function prepareProviderTest(
  input: AiTestRuntimeInput,
): AiProviderTestResult | PreparedProviderTest {
  const credentialConfigured = Boolean(input.credential);
  if (!input.enabled)
    return {
      name: input.name,
      status: 'disabled',
      message: 'Provider 已停用',
      credentialConfigured,
      authMode: input.authMode,
    };
  if (input.authMode === 'api_key' && !input.credential)
    return {
      name: input.name,
      status: 'unconfigured',
      message: '请先配置 API Key，再测试连接',
      credentialConfigured: false,
      authMode: input.authMode,
    };
  const model = input.testModel ?? input.models[0];
  if (!model) throw new BadRequestException('至少需要一个模型');
  if (!input.models.includes(model))
    throw new BadRequestException(`模型未被 Provider 选择: ${model}`);
  let purposeRoute: AiProviderExecutionRouteInput | undefined;
  if (input.testKind === 'generation' && input.purpose) {
    purposeRoute = matchingPurposeRoute(input, model);
    if (!purposeRoute)
      return invalidTestConfiguration(
        input,
        model,
        '模型 ' + model + ' 未配置业务用途 ' + input.purpose + ' 的匹配输出方式',
        input.mode,
      );
  }
  if (input.testKind !== 'generation' && (input.purpose !== undefined || input.mode !== undefined))
    return invalidTestConfiguration(
      input,
      model,
      '业务用途和输出方式只适用于业务用途生成测试',
      input.mode,
    );
  const purpose = input.purpose;
  const mode = purposeRoute?.mode ?? input.mode ?? 'json_validated';
  const pricingError = generationPricingError(input, model);
  if (pricingError) return invalidTestConfiguration(input, model, pricingError, mode);
  return { credentialConfigured, model, purposeRoute, purpose, mode };
}

function matchingPurposeRoute(input: AiTestRuntimeInput, model: string) {
  return input.executionRoutes?.find(
    (route) =>
      route.model === model &&
      route.contract.id === input.purpose &&
      route.enabled !== false &&
      (input.mode === undefined || route.mode === input.mode),
  );
}

function invalidTestConfiguration(
  input: AiTestRuntimeInput,
  model: string,
  message: string,
  mode: AiGenerationMode | undefined,
): AiProviderTestResult {
  return {
    name: input.name,
    status: 'config_error',
    message,
    credentialConfigured: Boolean(input.credential),
    authMode: input.authMode,
    testKind: input.testKind,
    ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
    ...(mode === undefined ? {} : { mode }),
    model,
    errorCode: 'invalid_config',
  };
}

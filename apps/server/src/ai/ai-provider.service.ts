import { buildAiProviderTestRuntime, type AiTestRuntimeInput } from './ai-provider-test-runtime.js';
export type { AiTestRuntimeInput } from './ai-provider-test-runtime.js';
import { modelRequestOptionsFields } from './ai-model-request-options.js';
import { aiTestRuntimeFingerprint } from './ai-provider-test-fingerprint.js';
import { aiProviderTestAuditDetails } from './ai-provider-test-audit.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { loadConfig } from '../platform/config.js';
import { PrismaService } from '../platform/prisma.service.js';
import { ProviderConfigService } from '../providers/provider-config.service.js';
import { ProviderHealthService, type ProviderState } from '../providers/provider-health.service.js';
import { AiProviderRegistry } from './provider-registry.js';
import { runProviderConnectionTest } from './provider-connection-test.js';
import { probeTimeoutOverrides } from './ai-provider-probe-timeout.js';
import {
  AiSdkGenerationAdapter,
  AiSdkGenerationError,
  type AiSdkGenerationResult,
} from './ai-sdk-generation.adapter.js';
import type { AiProvider } from './contracts.js';
import {
  aiProviderInputSchema,
  errorCodeFor,
  sanitizeAiProviderError,
  type AiProviderInput,
  type AiProviderModelCatalogResult,
  type AiProviderSummary,
  type AiProviderTestKind,
  type AiProviderTestPurpose,
  type AiProviderTestResult,
  type AiProviderTestStatus,
  type AiProviderExecutionRouteInput,
  type AiProviderLifecycleOptions,
  aiProviderTestInputSchema,
} from './ai-provider.contracts.js';
import { queryAiProviderModels } from './ai-provider-model-catalog-query.js';
import {
  aiProviderCapabilities,
  aiProviderSummaryFromRow,
  parseAiProviderSettings,
} from './ai-provider-summary.js';
import { evaluateAiProviderReadiness } from './ai-provider-readiness.js';
import {
  aiCostFactsSchema,
  type AiCostFacts,
  type AiUsageFacts,
  type AiGenerationMode,
} from '@thesis-ledger/schemas';
import {
  persistAiCapabilityRevocation,
  routeSnapshotsFromProviderRow,
  settingsFromAiProviderInput,
  type AiCapabilityRevocationInput,
} from './ai-provider-readiness.persistence.js';
import { createStoredAiProvider } from './ai-provider-runtime.js';
import { generationPricingError, testPricingForModel } from './ai-provider-test-pricing.js';
import {
  withAiProviderConfigurationTransaction,
  mutateAiProviderLifecycle,
  type StoredProviderLifecycleAction,
} from './ai-provider-configuration-transaction.js';
import { AiRoutingSettingsService } from './ai-routing-settings.service.js';
import { planAiProviderMigrations } from './ai-provider-migration.js';
import type {
  AiResearchDefaultCandidate,
  AiRoutingSettingsResponse,
  AiRoutingSettingsUpdate,
} from './ai-routing-settings.contracts.js';

import {
  VALIDATION_DURATION_SECONDS,
  type VerifiedRoute,
} from './ai-provider-validation-policy.js';

export { aiProviderInputSchema, sanitizeAiProviderError } from './ai-provider.contracts.js';

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

const unknownTestUsage = (): AiUsageFacts => ({
  status: 'unknown',
  inputTokens: null,
  outputTokens: null,
});

const unknownTestCost = (source: string | null = null): AiCostFacts => ({
  status: 'unknown',
  amount: null,
  currency: null,
  source,
  pricingVersion: null,
});

const decimalTestCost = (value: number) => value.toFixed(8).replace(/\.?0+$/u, '') || '0';

const configuredTimeout = () => {
  try {
    return loadConfig().aiTimeoutMs;
  } catch {
    return 30_000;
  }
};

@Injectable()
export class AiProviderService implements OnModuleInit {
  private readonly drafts = new Map<string, DraftTest>();
  private readonly draftTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly activeTests = new Map<
    string,
    { provider: string; controller: AbortController }
  >();

  constructor(
    private readonly configs: ProviderConfigService,
    private readonly health: ProviderHealthService,
    private readonly registry: AiProviderRegistry,
    private readonly sdk: AiSdkGenerationAdapter = new AiSdkGenerationAdapter(),
    @Optional() private readonly routingSettings?: AiRoutingSettingsService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async onModuleInit() {
    await this.refreshRegistry();
  }

  async list(transaction?: Prisma.TransactionClient): Promise<AiProviderSummary[]> {
    const rows = await this.configs.listStored(transaction);
    const databaseSummaries = await Promise.all(
      rows.map(async (row) => {
        const settings = parseAiProviderSettings(row.settings);
        const health =
          typeof this.health.get === 'function'
            ? await this.health.get(row.name).catch(() => null)
            : null;
        const summary = aiProviderSummaryFromRow(row, settings, health);
        const executionRoutes = routeSnapshotsFromProviderRow(
          row,
          settings,
          health?.state ?? row.health,
        ).map((snapshot) => evaluateAiProviderReadiness(snapshot, { budgetAuthorized: false }));
        return executionRoutes.length > 0 ? { ...summary, executionRoutes } : summary;
      }),
    );
    return databaseSummaries.sort(
      (left, right) => left.priority - right.priority || left.name.localeCompare(right.name),
    );
  }

  async migrationDryRun() {
    const rows = await this.configs.listStored();
    return planAiProviderMigrations(
      rows.map((row) => ({ name: row.name, settings: row.settings })),
    );
  }

  async getRoutingSettings(): Promise<AiRoutingSettingsResponse> {
    if (!this.routingSettings) return { researchDefault: null, revision: '0', candidates: [] };
    const settings = await this.routingSettings.read();
    return {
      ...settings,
      candidates: (await this.list()).flatMap((provider) =>
        this.researchCandidatesFromSummary(provider),
      ),
    };
  }

  async updateRoutingSettings(input: AiRoutingSettingsUpdate) {
    if (!this.routingSettings) throw new InternalServerErrorException('AI 默认模型设置不可用');
    const persist = async (transaction?: Prisma.TransactionClient) => {
      if (input.researchDefault) {
        const candidate = (await this.list(transaction))
          .flatMap((provider) => this.researchCandidatesFromSummary(provider))
          .find(
            (item) =>
              item.providerId === input.researchDefault?.providerId &&
              item.model === input.researchDefault?.model,
          );
        if (!candidate) throw new BadRequestException('研究默认模型必须配置研究报告用途');
        if (!candidate.enabled) throw new BadRequestException('研究默认模型所属 Provider 已停用');
        if (candidate.health === 'down')
          throw new BadRequestException('研究默认模型所属 Provider 当前不可用');
      }
      return this.routingSettings!.update(input, transaction);
    };
    const saved = this.prisma
      ? await withAiProviderConfigurationTransaction(this.prisma, persist)
      : await persist();
    return {
      ...saved,
      candidates: (await this.list()).flatMap((provider) =>
        this.researchCandidatesFromSummary(provider),
      ),
    };
  }

  async save(rawInput: unknown, verifiedRoutes?: VerifiedRoute[]) {
    const input = aiProviderInputSchema.parse(rawInput);
    const existing = await this.configs.findStored(input.name);
    if (existing) {
      if (!input.expectedRevision)
        throw new ConflictException('Provider 配置已存在，请刷新后再保存');
      if (input.expectedRevision !== existing.updatedAt.toISOString())
        throw new ConflictException('Provider 配置已变化，请刷新后重试');
      const existingSettings = parseAiProviderSettings(existing.settings);
      if (existingSettings?.modelPricing && input.modelPricing === undefined)
        throw new ConflictException('当前 Provider 含模型级价格，请使用新版完整配置后再保存');
    }
    const runtimeInput = this.runtimeInput(input, existing, '');
    const draft = this.consumeDraft(
      input.connectionTestToken,
      input.name,
      aiTestRuntimeFingerprint(runtimeInput),
      input.apiKey?.trim() || input.credentialsRef?.trim(),
    );
    const credential = input.apiKey?.trim() || input.credentialsRef?.trim() || draft?.credential;
    if (!existing && input.authMode === 'api_key' && !credential && input.enabled !== false)
      throw new BadRequestException('请填写 API Key');
    const persist = async (transaction?: Prisma.TransactionClient) => {
      await this.assertResearchDefaultPreserved(input, transaction);
      return this.configs.saveAi(
        {
          name: input.name,
          enabled: input.enabled ?? existing?.enabled ?? true,
          priority: input.priority,
          capabilities: input.capabilities ?? ['chat'],
          ...(credential ? { credentialsRef: credential } : {}),
          ...(input.authMode === 'none' ? { clearCredentials: true } : {}),
          settings: {
            ...settingsFromAiProviderInput(input, existing?.settings),
            ...(verifiedRoutes === undefined ? {} : { generationValidation: verifiedRoutes }),
          },
          ...(input.expectedRevision === undefined
            ? {}
            : { expectedRevision: input.expectedRevision }),
        },
        transaction,
      );
    };
    const saved = this.prisma
      ? await withAiProviderConfigurationTransaction(this.prisma, persist)
      : await persist();
    if (draft) await this.recordSavedHealth(input.name, true, draft.latencyMs, draft.checkedAt);
    const observed = verifiedRoutes?.find(
      (record) =>
        record.latencyMs !== undefined &&
        (!existing || Date.parse(record.checkedAt) > existing.updatedAt.getTime()),
    );
    if (observed)
      await this.recordSavedHealth(
        input.name,
        true,
        observed.latencyMs!,
        new Date(observed.checkedAt),
      );
    await this.refreshOrThrow();
    return this.findSummary(input.name, saved.updatedAt?.toISOString?.() ?? null);
  }

  async testDraft(rawInput: unknown): Promise<AiProviderTestResult> {
    const input = aiProviderTestInputSchema.parse(rawInput);
    const existing = await this.configs.findStored(input.name);
    const credential =
      input.authMode === 'none'
        ? ''
        : input.apiKey?.trim() ||
          input.credentialsRef?.trim() ||
          (existing ? await this.configs.readCredential(existing) : '');
    const runtimeInput = this.runtimeInput(
      input,
      existing,
      credential,
      input.model,
      input.testKind,
      input.budgetAuthorized,
      input.purpose,
      input.mode,
      input.requestId,
    );
    return this.executeTest(runtimeInput, false, aiTestRuntimeFingerprint(runtimeInput));
  }

  async testSaved(
    name: string,
    options: {
      model?: string;
      testKind?: AiProviderTestKind;
      purpose?: AiProviderTestPurpose;
      mode?: AiGenerationMode;
      budgetAuthorized?: boolean;
      requestId?: string;
    } = {},
  ): Promise<AiProviderTestResult> {
    const config = await this.configs.findStored(name);
    if (!config || config.type !== 'ai') throw new NotFoundException('AI Provider 配置不存在');
    const settings = parseAiProviderSettings(config.settings);
    if (!settings) return this.configError(name, '保存的 AI Provider 配置无效');
    const result = await this.executeTest(
      {
        ...settings,
        name,
        credential: settings.authMode === 'none' ? '' : await this.configs.readCredential(config),
        authMode: settings.authMode,
        enabled: config.enabled,
        priority: config.priority,
        capabilities: aiProviderCapabilities(config.capabilities),
        ...(options.model === undefined ? {} : { testModel: options.model }),
        testKind: options.testKind ?? 'connection',
        ...(options.purpose === undefined ? {} : { purpose: options.purpose }),
        ...(options.mode === undefined ? {} : { mode: options.mode }),
        ...(options.budgetAuthorized === undefined
          ? {}
          : { budgetAuthorized: options.budgetAuthorized }),
        ...(options.requestId === undefined ? {} : { requestId: options.requestId }),
      },
      true,
    );
    await this.refreshOrThrow();
    return result;
  }

  cancelTest(name: string, requestId: string) {
    const active = this.activeTests.get(requestId);
    if (!active || active.provider !== name) return { name, requestId, cancelled: false };
    active.controller.abort();
    return { name, requestId, cancelled: true };
  }

  async models(rawInput: unknown): Promise<AiProviderModelCatalogResult> {
    return queryAiProviderModels(rawInput, this.configs);
  }

  async setEnabled(name: string, enabled: boolean, options: AiProviderLifecycleOptions = {}) {
    const config = await this.configs.findStored(name);
    if (!config || config.type !== 'ai') throw new NotFoundException('AI Provider 配置不存在');
    if (options.expectedRevision && options.expectedRevision !== config.updatedAt.toISOString())
      throw new ConflictException('Provider 配置已变化，请刷新后重试');
    await this.mutateStoredProvider(name, { kind: 'set-enabled', enabled }, options);
    await this.refreshOrThrow();
    return this.findSummary(name);
  }

  async remove(name: string, options: AiProviderLifecycleOptions = {}) {
    const config = await this.configs.findStored(name);
    if (!config || config.type !== 'ai') throw new NotFoundException('AI Provider 配置不存在');
    if (options.expectedRevision && options.expectedRevision !== config.updatedAt.toISOString())
      throw new ConflictException('Provider 配置已变化，请刷新后重试');
    await this.mutateStoredProvider(name, { kind: 'delete' }, options);
    await this.refreshOrThrow();
    return { name, deleted: true };
  }

  async refreshRegistry() {
    const rows = await this.configs.listStored();
    const databaseProviders = await Promise.all(
      rows.map(async (row) => createStoredAiProvider(row, this.configs, configuredTimeout())),
    );
    const next = databaseProviders.filter((provider): provider is AiProvider => provider !== null);
    const databaseRoutes = rows.flatMap((row) =>
      routeSnapshotsFromProviderRow(row, parseAiProviderSettings(row.settings), row.health),
    );
    this.registry.replace(next, databaseRoutes);
    return next;
  }

  private async refreshOrThrow() {
    try {
      await this.refreshRegistry();
    } catch (error) {
      throw new InternalServerErrorException(
        `AI Provider Registry 刷新失败：${sanitizeAiProviderError(error)}`,
      );
    }
  }

  readiness(name: string) {
    return this.registry.readiness(name, false);
  }

  async revokeCapability(input: AiCapabilityRevocationInput) {
    await persistAiCapabilityRevocation(this.configs, input);
    await this.refreshOrThrow();
    return this.registry.readiness(input.providerId, false);
  }

  private async findSummary(name: string, fallbackUpdatedAt: string | null = null) {
    const summary = (await this.list()).find((item) => item.name === name);
    if (!summary) throw new InternalServerErrorException('AI Provider 保存后无法读取');
    return fallbackUpdatedAt && !summary.updatedAt
      ? { ...summary, updatedAt: fallbackUpdatedAt }
      : summary;
  }

  private researchCandidatesFromSummary(provider: AiProviderSummary): AiResearchDefaultCandidate[] {
    const models = new Set(provider.models);
    const researchModels = (provider.executionRouteConfigs ?? [])
      .filter((route) => route.enabled !== false && route.contract.id === 'research')
      .map((route) => route.model)
      .filter((model) => models.has(model));
    return [...new Set(researchModels)].map((model) => {
      const pricing = provider.modelPricing?.[model];
      return {
        providerId: provider.name,
        providerName: provider.name,
        model,
        enabled: provider.enabled,
        health: provider.health,
        authMode: provider.authMode,
        priceConfigured:
          pricing?.costPer1kInput !== undefined &&
          pricing.costPer1kOutput !== undefined &&
          Boolean(pricing.costCurrency),
      };
    });
  }

  private async assertNotResearchDefault(providerId: string) {
    const settings = await this.routingSettings?.read();
    if (settings?.researchDefault?.providerId === providerId)
      throw new ConflictException('该 Provider 是研究默认模型，请先更换或清除研究默认模型');
  }

  private async mutateStoredProvider(
    name: string,
    action: StoredProviderLifecycleAction,
    options: AiProviderLifecycleOptions,
  ) {
    const expectedRevision = options.expectedRevision;
    if (!expectedRevision) throw new ConflictException('Provider 配置版本缺失，请刷新后重试');

    if (!this.prisma) {
      const settings = await this.routingSettings?.read();
      const isResearchDefault = settings?.researchDefault?.providerId === name;
      if (isResearchDefault && !options.clearResearchDefault)
        throw new ConflictException('该 Provider 是研究默认模型，请先更换或清除研究默认模型');
      if (isResearchDefault)
        throw new ConflictException('清除研究默认模型必须通过原子事务完成，请刷新后重试');
      if (options.clearResearchDefault)
        throw new ConflictException('当前 Provider 不是研究默认模型，不能清除默认路由');
      if (action.kind === 'set-enabled')
        return this.configs.setEnabled(name, action.enabled, expectedRevision);
      return this.configs.deleteStored(name, expectedRevision);
    }

    const expectedDate = new Date(expectedRevision);
    if (Number.isNaN(expectedDate.getTime()))
      throw new ConflictException('Provider 配置版本无效，请刷新后重试');

    return withAiProviderConfigurationTransaction(this.prisma, (transaction) =>
      mutateAiProviderLifecycle(transaction, name, action, options),
    );
  }

  private async assertResearchDefaultPreserved(
    input: AiProviderInput,
    transaction?: Prisma.TransactionClient,
  ) {
    const settings = await this.routingSettings?.read(transaction);
    const researchDefault = settings?.researchDefault;
    if (!researchDefault || researchDefault.providerId !== input.name) return;
    if (input.enabled === false)
      throw new ConflictException('保存会停用研究默认 Provider，请先更换或清除研究默认模型');
    if (!input.models.includes(researchDefault.model))
      throw new ConflictException('保存会移除研究默认模型，请先更换或清除研究默认模型');
    if (
      input.executionRoutes !== undefined &&
      !input.executionRoutes.some(
        (route) =>
          route.enabled !== false &&
          route.model === researchDefault.model &&
          route.contract.id === 'research',
      )
    )
      throw new ConflictException('保存会移除研究默认用途，请先更换或清除研究默认模型');
  }

  private async executeTest(
    input: AiTestRuntimeInput,
    persist: boolean,
    fingerprint?: string,
  ): Promise<AiProviderTestResult> {
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
      purposeRoute = input.executionRoutes?.find(
        (route) =>
          route.model === model &&
          route.contract.id === input.purpose &&
          route.enabled !== false &&
          (input.mode === undefined || route.mode === input.mode),
      );
      if (!purposeRoute)
        return {
          name: input.name,
          status: 'config_error',
          message: `模型 ${model} 未配置业务用途 ${input.purpose} 的匹配输出方式`,
          credentialConfigured,
          authMode: input.authMode,
          testKind: input.testKind,
          purpose: input.purpose,
          ...(input.mode === undefined ? {} : { mode: input.mode }),
          model,
          errorCode: 'invalid_config',
        };
    }
    if (
      input.testKind !== 'generation' &&
      (input.purpose !== undefined || input.mode !== undefined)
    )
      return {
        name: input.name,
        status: 'config_error',
        message: '业务用途和输出方式只适用于业务用途生成测试',
        credentialConfigured,
        authMode: input.authMode,
        testKind: input.testKind,
        ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
        ...(input.mode === undefined ? {} : { mode: input.mode }),
        model,
        errorCode: 'invalid_config',
      };
    const purpose = input.purpose;
    const mode = purposeRoute?.mode ?? input.mode ?? 'json_validated';
    const pricingError = generationPricingError(input, model);
    if (pricingError)
      return {
        name: input.name,
        status: 'config_error',
        message: pricingError,
        credentialConfigured,
        authMode: input.authMode,
        testKind: input.testKind,
        ...(purpose === undefined ? {} : { purpose }),
        mode,
        model,
        errorCode: 'invalid_config',
      };
    const started = Date.now();
    const requestId = input.requestId ?? randomUUID();
    if (this.activeTests.has(requestId))
      throw new ConflictException('测试请求正在进行中，请勿重复提交');
    const controller = new AbortController();
    this.activeTests.set(requestId, { provider: input.name, controller });
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
        ...(purposeRoute?.reasoningEnabled === undefined
          ? {}
          : { reasoningEnabled: purposeRoute.reasoningEnabled }),
        ...probeTimeoutOverrides(input, purposeRoute),
      });
      if (controller.signal.aborted) throw new Error('AI provider test cancelled');
      const facts = this.testFacts(input, model, result);
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
    } catch (error) {
      const latencyMs = Date.now() - started;
      const facts = this.testFailureFacts(error);
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
      const errorCode =
        error instanceof AiSdkGenerationError ? error.fact.code : errorCodeFor(error);
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
    } finally {
      if (this.activeTests.get(requestId)?.controller === controller)
        this.activeTests.delete(requestId);
    }
  }

  private async recordSavedHealth(
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

  private consumeDraft(
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

  private runtimeInput(
    input: AiProviderInput,
    existing: { enabled: boolean; settings?: unknown } | null,
    credential: string,
    testModel?: string,
    testKind: AiProviderTestKind = 'connection',
    budgetAuthorized?: boolean,
    purpose?: AiProviderTestPurpose,
    mode?: AiGenerationMode,
    requestId?: string,
  ): AiTestRuntimeInput {
    return buildAiProviderTestRuntime(
      input,
      existing,
      credential,
      testModel,
      testKind,
      budgetAuthorized,
      purpose,
      mode,
      requestId,
    );
  }

  private testFacts(
    input: AiTestRuntimeInput,
    model: string,
    result: Pick<AiSdkGenerationResult<unknown>, 'usage' | 'providerCost' | 'providerCostCurrency'>,
  ): { usage: AiUsageFacts; cost: AiCostFacts } {
    const usage = result.usage ?? unknownTestUsage();
    const pricing = testPricingForModel(input, model);
    const providerCurrency = result.providerCostCurrency?.trim().toUpperCase();
    if (typeof result.providerCost === 'string' && /^[A-Z]{3}$/u.test(providerCurrency ?? '')) {
      const reported = aiCostFactsSchema.safeParse({
        status: 'known',
        amount: result.providerCost,
        currency: providerCurrency,
        source: 'provider_reported',
        pricingVersion: pricing.pricingVersion ?? null,
      });
      if (reported.success) return { usage, cost: reported.data };
    }
    const currency = pricing.costCurrency?.trim().toUpperCase();
    if (
      usage.inputTokens === null ||
      usage.outputTokens === null ||
      pricing.costPer1kInput === undefined ||
      pricing.costPer1kOutput === undefined ||
      !/^[A-Z]{3}$/u.test(currency ?? '')
    )
      return { usage, cost: unknownTestCost() };
    const estimated = aiCostFactsSchema.safeParse({
      status: 'estimated',
      amount: decimalTestCost(
        (usage.inputTokens * pricing.costPer1kInput +
          usage.outputTokens * pricing.costPer1kOutput) /
          1_000,
      ),
      currency,
      source: 'configured_model_pricing',
      pricingVersion: pricing.pricingVersion ?? null,
    });
    return { usage, cost: estimated.success ? estimated.data : unknownTestCost() };
  }

  private testFailureFacts(error: unknown): { usage: AiUsageFacts; cost: AiCostFacts } {
    return {
      usage: error instanceof AiSdkGenerationError ? error.usage : unknownTestUsage(),
      cost: unknownTestCost('provider_cost_unavailable'),
    };
  }

  private credentialHash(credential: string) {
    return createHash('sha256').update(credential, 'utf8').digest('hex');
  }

  private configError(name: string, message: string): AiProviderTestResult {
    return {
      name,
      status: 'config_error',
      message,
      credentialConfigured: false,
      errorCode: 'invalid_config',
    };
  }
}

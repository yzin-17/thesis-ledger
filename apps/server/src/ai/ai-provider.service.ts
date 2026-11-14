import { assertAiProviderSaveRevision, aiProviderSaveInput } from './ai-provider-save-input.js';
import { AiProviderTests } from './ai-provider-tests.js';
export { AI_GENERATION_SLOW_AFTER_MS } from './ai-provider-tests.js';

import { buildAiProviderTestRuntime, type AiTestRuntimeInput } from './ai-provider-test-runtime.js';
export type { AiTestRuntimeInput } from './ai-provider-test-runtime.js';

import { aiTestRuntimeFingerprint } from './ai-provider-test-fingerprint.js';

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

import { loadConfig } from '../platform/config.js';
import { PrismaService } from '../platform/prisma.service.js';
import { ProviderConfigService } from '../providers/provider-config.service.js';
import { ProviderHealthService } from '../providers/provider-health.service.js';
import { AiProviderRegistry } from './provider-registry.js';

import { AiSdkGenerationAdapter } from './ai-sdk-generation.adapter.js';
import type { AiProvider } from './contracts.js';
import {
  aiProviderInputSchema,
  sanitizeAiProviderError,
  type AiProviderInput,
  type AiProviderModelCatalogResult,
  type AiProviderSummary,
  type AiProviderTestKind,
  type AiProviderTestPurpose,
  type AiProviderTestResult,
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
import type { AiGenerationMode } from '@thesis-ledger/schemas';
import {
  persistAiCapabilityRevocation,
  routeSnapshotsFromProviderRow,
  type AiCapabilityRevocationInput,
} from './ai-provider-readiness.persistence.js';
import { createStoredAiProvider } from './ai-provider-runtime.js';

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

import { type VerifiedRoute } from './ai-provider-validation-policy.js';

export { aiProviderInputSchema, sanitizeAiProviderError } from './ai-provider.contracts.js';

const configuredTimeout = () => {
  try {
    return loadConfig().aiTimeoutMs;
  } catch {
    return 30_000;
  }
};

@Injectable()
export class AiProviderService implements OnModuleInit {
  private readonly tests: AiProviderTests;

  constructor(
    private readonly configs: ProviderConfigService,
    private readonly health: ProviderHealthService,
    private readonly registry: AiProviderRegistry,
    sdk: AiSdkGenerationAdapter = new AiSdkGenerationAdapter(),
    @Optional() private readonly routingSettings?: AiRoutingSettingsService,
    @Optional() private readonly prisma?: PrismaService,
  ) {
    this.tests = new AiProviderTests(configs, health, sdk);
  }

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
    assertAiProviderSaveRevision(input, existing);
    const runtimeInput = this.runtimeInput(input, existing, '');
    const draft = this.tests.consumeDraft(
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
        aiProviderSaveInput(input, existing, credential, verifiedRoutes),
        transaction,
      );
    };
    const saved = this.prisma
      ? await withAiProviderConfigurationTransaction(this.prisma, persist)
      : await persist();
    if (draft)
      await this.tests.recordSavedHealth(input.name, true, draft.latencyMs, draft.checkedAt);
    const observed = verifiedRoutes?.find(
      (record) =>
        record.latencyMs !== undefined &&
        (!existing || Date.parse(record.checkedAt) > existing.updatedAt.getTime()),
    );
    if (observed)
      await this.tests.recordSavedHealth(
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
    return this.tests.executeTest(runtimeInput, false, aiTestRuntimeFingerprint(runtimeInput));
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
    const result = await this.tests.executeTest(
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
    return this.tests.cancelTest(name, requestId);
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

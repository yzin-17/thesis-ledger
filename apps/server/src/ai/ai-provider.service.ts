import {
  BadRequestException,
  BadGatewayException,
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
import { AiProviderRegistry, routeSnapshotsFromProvider } from './provider-registry.js';
import { createConfiguredAiProviders } from './provider-adapters.js';
import { runProviderConnectionTest } from './provider-connection-test.js';
import {
  AiSdkGenerationAdapter,
  AiSdkGenerationError,
  type AiSdkGenerationResult,
} from './ai-sdk-generation.adapter.js';
import type { AiProvider } from './contracts.js';
import {
  aiProviderInputSchema,
  aiProviderModelCatalogInputSchema,
  errorCodeFor,
  sanitizeAiProviderError,
  type AiProviderInput,
  type AiProviderModelReasoning,
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
import { fetchAiProviderModelCatalog } from './ai-provider-model-catalog.js';
import {
  aiProviderCapabilities,
  aiProviderSummaryFromProvider,
  aiProviderSummaryFromRow,
  parseAiProviderSettings,
} from './ai-provider-summary.js';
import { evaluateAiProviderReadiness } from './ai-provider-readiness.js';
import {
  aiCostFactsSchema,
  aiUpstreamSelectionSchema,
  type AiAdapter,
  type AiChatImplementation,
  type AiCostFacts,
  type AiUsageFacts,
  type AiUpstreamFormat,
  type AiGenerationMode,
} from '@thesis-ledger/schemas';
import {
  runtimeAdapterForSelection,
  type AiCompatibilityExtensionProfile,
} from './ai-provider-upstream.js';
import {
  persistAiCapabilityRevocation,
  routeSnapshotsFromProviderRow,
  settingsFromAiProviderInput,
  type AiCapabilityRevocationInput,
} from './ai-provider-readiness.persistence.js';
import { createStoredAiProvider } from './ai-provider-runtime.js';
import type { AiProviderPricing } from './ai-provider-pricing.js';
import { AiRoutingSettingsService } from './ai-routing-settings.service.js';
import { planAiProviderMigrations } from './ai-provider-migration.js';
import type {
  AiResearchDefaultCandidate,
  AiRoutingSettingsResponse,
  AiRoutingSettingsUpdate,
} from './ai-routing-settings.contracts.js';

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

interface AiTestRuntimeInput {
  name: string;
  requestId?: string;
  baseUrl: string;
  models: string[];
  authMode: 'api_key' | 'none';
  testModel?: string;
  testKind: AiProviderTestKind;
  purpose?: AiProviderTestPurpose;
  mode?: AiGenerationMode;
  budgetAuthorized?: boolean;
  modelPricing?: Readonly<Record<string, AiTestModelPricing>>;
  modelReasoning?: Record<string, AiProviderModelReasoning>;
  credential: string;
  enabled: boolean;
  priority: number;
  capabilities: string[];
  timeoutMs?: number;
  firstOutputTimeoutMs?: number;
  outputIdleTimeoutMs?: number;
  costPer1kInput?: number;
  costPer1kOutput?: number;
  costCurrency?: string;
  pricingVersion?: string;
  upstreamFormat: AiUpstreamFormat;
  chatImplementation?: AiChatImplementation;
  compatibilityExtensionProfile?: AiCompatibilityExtensionProfile;
  adapter: AiAdapter;
  executionRoutes?: AiProviderExecutionRouteInput[];
}

type StoredProviderLifecycleAction =
  | { kind: 'set-enabled'; enabled: boolean }
  | { kind: 'delete' };

type AiTestModelPricing = {
  costPer1kInput?: number | undefined;
  costPer1kOutput?: number | undefined;
  costCurrency?: string | undefined;
  pricingVersion?: string | undefined;
};

const DRAFT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_PROBE_TIMEOUT_MS = 30_000;

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

const decimalTestCost = (value: number) =>
  value.toFixed(8).replace(/\.?0+$/u, '') || '0';

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

  async list(): Promise<AiProviderSummary[]> {
    const rows = await this.configs.listStored();
    const environment = this.environmentProviders();
    const databaseIds = new Set(rows.map((row) => row.name));
    const disabled = new Set(rows.filter((row) => !row.enabled).map((row) => row.name));
    const environmentSummaries = environment
      .filter((provider) => !databaseIds.has(provider.id) && !disabled.has(provider.id))
      .map((provider) => {
        const summary = aiProviderSummaryFromProvider(provider);
        const executionRoutes = routeSnapshotsFromProvider(provider).map((snapshot) =>
          evaluateAiProviderReadiness(snapshot, { budgetAuthorized: false }),
        );
        return executionRoutes.length > 0 ? { ...summary, executionRoutes } : summary;
      });
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
    return [...databaseSummaries, ...environmentSummaries].sort(
      (left, right) => left.priority - right.priority || left.name.localeCompare(right.name),
    );
  }

  async migrationDryRun() {
    const rows = await this.configs.listStored();
    return planAiProviderMigrations(rows.map((row) => ({ name: row.name, settings: row.settings })));
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
    if (input.researchDefault) {
      const candidate = (await this.getRoutingSettings()).candidates.find(
        (item) =>
          item.providerId === input.researchDefault?.providerId &&
          item.model === input.researchDefault?.model,
      );
      if (!candidate) throw new BadRequestException('研究默认模型必须配置研究报告用途');
      if (!candidate.enabled) throw new BadRequestException('研究默认模型所属 Provider 已停用');
      if (candidate.health === 'down')
        throw new BadRequestException('研究默认模型所属 Provider 当前不可用');
    }
    const saved = await this.routingSettings.update({
      researchDefault: input.researchDefault,
      expectedRevision: input.expectedRevision,
    });
    return {
      ...saved,
      candidates: (await this.list()).flatMap((provider) =>
        this.researchCandidatesFromSummary(provider),
      ),
    };
  }

  async save(rawInput: unknown) {
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
    await this.assertResearchDefaultPreserved(input);
    const environment = this.environmentProviders();
    const hasInputCredential = Boolean(input.apiKey?.trim() || input.credentialsRef?.trim());
    if (
      !existing &&
      environment.some((provider) => provider.id === input.name) &&
      input.authMode === 'api_key' &&
      !hasInputCredential
    )
      throw new BadRequestException('接管部署配置时必须重新输入 API Key');
    const runtimeInput = this.runtimeInput(input, existing, '');
    const draft = this.consumeDraft(
      input.connectionTestToken,
      input.name,
      this.runtimeFingerprint(runtimeInput),
      input.apiKey?.trim() || input.credentialsRef?.trim(),
    );
    const credential = input.apiKey?.trim() || input.credentialsRef?.trim() || draft?.credential;
    const saved = await this.configs.saveAi({
      name: input.name,
      enabled: input.enabled ?? existing?.enabled ?? true,
      priority: input.priority,
      capabilities: input.capabilities ?? ['chat'],
      ...(credential ? { credentialsRef: credential } : {}),
      ...(input.authMode === 'none' ? { clearCredentials: true } : {}),
      settings: settingsFromAiProviderInput(input, existing?.settings),
      ...(input.expectedRevision === undefined
        ? {}
        : { expectedRevision: input.expectedRevision }),
      ...(draft ? {} : {}),
    });
    if (draft) await this.recordSavedHealth(input.name, true, draft.latencyMs, draft.checkedAt);
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
    return this.executeTest(runtimeInput, false, this.runtimeFingerprint(runtimeInput));
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
    const input = aiProviderModelCatalogInputSchema.parse(rawInput);
    const existing = input.name ? await this.configs.findStored(input.name) : undefined;
    if (existing && existing.type !== 'ai')
      throw new ConflictException('同名 Provider 已存在且不是 AI，不能读取其模型目录');
    const suppliedCredential = input.apiKey?.trim() || input.credentialsRef?.trim();
    const existingSettings = existing ? parseAiProviderSettings(existing.settings) : null;
    if (existing && input.authMode === 'api_key' && !suppliedCredential) {
      if (!existingSettings) throw new BadRequestException('保存的 AI Provider 配置无效');
      const requestedBaseUrl = input.baseUrl.replace(/\/+$/u, '');
      const savedBaseUrl = existingSettings.baseUrl.replace(/\/+$/u, '');
      if (requestedBaseUrl !== savedBaseUrl)
        throw new BadRequestException('Base URL 已变化，请输入 API Key 后重新获取模型目录');
    }
    const credential =
      input.authMode === 'none'
        ? ''
        : suppliedCredential || (existing ? await this.configs.readCredential(existing) : '');
    try {
      const catalog = await fetchAiProviderModelCatalog(
        input.baseUrl,
        credential,
        input.timeoutMs ?? configuredTimeout(),
        input.upstreamFormat ?? existingSettings?.upstreamFormat ?? 'chat-completions',
        input.authMode,
      );
      return { ...catalog, fetchedAt: new Date().toISOString() };
    } catch (error) {
      throw new BadGatewayException(
        `获取 Provider 模型目录失败：${sanitizeAiProviderError(error, credential)}`,
      );
    }
  }

  async setEnabled(
    name: string,
    enabled: boolean,
    options: AiProviderLifecycleOptions = {},
  ) {
    const config = await this.configs.findStored(name);
    if (!config || config.type !== 'ai') {
      if (this.environmentProviders().some((provider) => provider.id === name))
        throw new ConflictException('部署配置不可启停，请先创建数据库配置接管');
      throw new NotFoundException('AI Provider 配置不存在');
    }
    if (options.expectedRevision && options.expectedRevision !== config.updatedAt.toISOString())
      throw new ConflictException('Provider 配置已变化，请刷新后重试');
    await this.mutateStoredProvider(
      name,
      { kind: 'set-enabled', enabled },
      options,
    );
    await this.refreshOrThrow();
    return this.findSummary(name);
  }

  async remove(name: string, options: AiProviderLifecycleOptions = {}) {
    const config = await this.configs.findStored(name);
    if (!config || config.type !== 'ai') {
      if (this.environmentProviders().some((provider) => provider.id === name))
        throw new ConflictException('部署配置不可删除');
      throw new NotFoundException('AI Provider 配置不存在');
    }
    if (options.expectedRevision && options.expectedRevision !== config.updatedAt.toISOString())
      throw new ConflictException('Provider 配置已变化，请刷新后重试');
    await this.mutateStoredProvider(name, { kind: 'delete' }, options);
    await this.refreshOrThrow();
    return { name, deleted: true };
  }

  async refreshRegistry() {
    const rows = await this.configs.listStored();
    const environment = this.environmentProviders();
    const disabled = new Set(rows.filter((row) => !row.enabled).map((row) => row.name));
    const databaseIds = new Set(rows.map((row) => row.name));
    const databaseProviders = await Promise.all(
      rows.map(async (row) => createStoredAiProvider(row, this.configs, configuredTimeout())),
    );
    const next = [
      ...databaseProviders.filter((provider): provider is AiProvider => provider !== null),
      ...environment.filter(
        (provider) => !databaseIds.has(provider.id) && !disabled.has(provider.id),
      ),
    ];
    const databaseRoutes = rows.flatMap((row) =>
      routeSnapshotsFromProviderRow(row, parseAiProviderSettings(row.settings), row.health),
    );
    const environmentRoutes = next
      .filter((provider) => provider.metadata?.source !== 'database')
      .flatMap((provider) => routeSnapshotsFromProvider(provider));
    this.registry.replace(next, [...databaseRoutes, ...environmentRoutes]);
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

  private environmentProviders() {
    try {
      return createConfiguredAiProviders(loadConfig()).map((provider) => {
        if (provider.metadata) provider.metadata.source = 'environment';
        return provider;
      });
    } catch {
      return [];
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
      .filter((route) => route.contract.id === 'research')
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
    if (!expectedRevision)
      throw new ConflictException('Provider 配置版本缺失，请刷新后重试');

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

    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.providerConfig.findUnique({ where: { name } });
      if (!current || current.type !== 'ai') throw new NotFoundException('AI Provider 配置不存在');
      if (current.updatedAt.toISOString() !== expectedRevision)
        throw new ConflictException('Provider 配置已变化，请刷新后重试');

      const settings = await transaction.aiRoutingSettings.findUnique({
        where: { id: 'global' },
      });
      const isResearchDefault = settings?.researchDefaultProvider === name;
      if (isResearchDefault) {
        if (!options.clearResearchDefault)
          throw new ConflictException('该 Provider 是研究默认模型，请先更换或清除研究默认模型');
        if (
          !options.expectedSettingsRevision ||
          options.expectedSettingsRevision !== String(settings.revision)
        )
          throw new ConflictException('AI 默认模型设置已变化，请刷新后重试');
        const cleared = await transaction.aiRoutingSettings.updateMany({
          where: { id: 'global', revision: settings.revision },
          data: {
            researchDefaultProvider: null,
            researchDefaultModel: null,
            revision: settings.revision + 1,
          },
        });
        if (cleared.count !== 1)
          throw new ConflictException('AI 默认模型设置已变化，请刷新后重试');
      } else if (options.clearResearchDefault) {
        throw new ConflictException('当前 Provider 不是研究默认模型，不能清除默认路由');
      }

      if (action.kind === 'set-enabled') {
        const updated = await transaction.providerConfig.updateMany({
          where: { name, updatedAt: expectedDate },
          data: { enabled: action.enabled },
        });
        if (updated.count !== 1)
          throw new ConflictException('Provider 配置已变化，请刷新后重试');
        return transaction.providerConfig.findUnique({ where: { name } });
      }

      const deleted = await transaction.providerConfig.deleteMany({
        where: { name, updatedAt: expectedDate },
      });
      if (deleted.count !== 1)
        throw new ConflictException('Provider 配置已变化，请刷新后重试');
      return null;
    });
  }

  private async assertResearchDefaultPreserved(input: AiProviderInput) {
    const settings = await this.routingSettings?.read();
    const researchDefault = settings?.researchDefault;
    if (!researchDefault || researchDefault.providerId !== input.name) return;
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
    if (input.testKind !== 'generation' && (input.purpose !== undefined || input.mode !== undefined))
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
    const pricingError = this.generationPricingError(input, model);
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
        timeoutMs: input.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS,
        requestId,
        signal: controller.signal,
        ...(purpose === undefined ? {} : { purpose }),
        mode,
      });
      if (controller.signal.aborted) throw new Error('AI provider test cancelled');
      const facts = this.testFacts(input, model, result);
      if (!persist) {
        const testToken = randomUUID();
        this.drafts.set(testToken, {
          name: input.name,
          fingerprint: fingerprint ?? this.runtimeFingerprint(input),
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
        this.testRecordDetails(input, model, facts),
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
      if (controller.signal.aborted) {
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
          this.testRecordDetails(input, model, facts, 'cancelled', 'cancelled'),
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
      // 探针自带 total 超时，适配器只能看到合并后的 signal，会把探针超时也归为 “cancelled”。
      // 调用方没有取消时，这里必须把超时如实报成 provider_timeout，不能显示成用户取消。
      const probeTimedOut =
        error instanceof AiSdkGenerationError &&
        error.fact.code === 'cancelled' &&
        !controller.signal.aborted;
      const errorCode = probeTimedOut ? 'provider_timeout' : errorCodeFor(error);
      const message = probeTimedOut
        ? `Provider 未在 ${input.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS} ms 内返回结果，已按超时中断`
        : sanitizeAiProviderError(error, input.credential);
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
        this.testRecordDetails(input, model, facts, errorCode),
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
  ) {
    const state = await this.health.record(
      name,
      success,
      latencyMs,
      errorCode,
      checkedAt,
      'manual',
      details,
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
      await this.health.recordHistory(name, state, latencyMs, 'cancelled', checkedAt, 'manual', details);
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
    const selection = aiUpstreamSelectionSchema.parse({
      upstreamFormat: input.upstreamFormat,
      ...(input.chatImplementation === undefined
        ? {}
        : { chatImplementation: input.chatImplementation }),
    });
    const existingSettings = existing ? parseAiProviderSettings(existing.settings) : null;
    const compatibilityExtensionProfile = existingSettings?.compatibilityExtensionProfile;
    const adapter = runtimeAdapterForSelection(selection, compatibilityExtensionProfile);
    return {
      name: input.name,
      ...(requestId === undefined ? {} : { requestId }),
      baseUrl: input.baseUrl,
      models: input.models,
      authMode: input.authMode,
      ...(testModel === undefined ? {} : { testModel }),
      testKind,
      ...(purpose === undefined ? {} : { purpose }),
      ...(mode === undefined ? {} : { mode }),
      ...(budgetAuthorized === undefined ? {} : { budgetAuthorized }),
      ...(input.modelPricing === undefined ? {} : { modelPricing: input.modelPricing }),
      ...(input.modelReasoning ? { modelReasoning: input.modelReasoning } : {}),
      credential,
      enabled: input.enabled ?? existing?.enabled ?? true,
      priority: input.priority,
      capabilities: input.capabilities ?? ['chat'],
      ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
      ...(input.firstOutputTimeoutMs === undefined
        ? {}
        : { firstOutputTimeoutMs: input.firstOutputTimeoutMs }),
      ...(input.outputIdleTimeoutMs === undefined
        ? {}
        : { outputIdleTimeoutMs: input.outputIdleTimeoutMs }),
      ...(input.costPer1kInput === undefined ? {} : { costPer1kInput: input.costPer1kInput }),
      ...(input.costPer1kOutput === undefined ? {} : { costPer1kOutput: input.costPer1kOutput }),
      ...(input.costCurrency === undefined ? {} : { costCurrency: input.costCurrency }),
      upstreamFormat: selection.upstreamFormat,
      ...(selection.upstreamFormat === 'chat-completions'
        ? { chatImplementation: selection.chatImplementation }
        : {}),
      ...(compatibilityExtensionProfile ? { compatibilityExtensionProfile } : {}),
      adapter,
      ...(input.executionRoutes === undefined ? {} : { executionRoutes: input.executionRoutes }),
    };
  }

  private runtimeFingerprint(input: AiTestRuntimeInput) {
    return JSON.stringify({
      name: input.name,
      baseUrl: input.baseUrl,
      models: input.models,
      modelReasoning: input.modelReasoning ?? null,
      enabled: input.enabled,
      priority: input.priority,
      capabilities: input.capabilities,
      authMode: input.authMode,
      timeoutMs: input.timeoutMs ?? null,
      firstOutputTimeoutMs: input.firstOutputTimeoutMs ?? null,
      outputIdleTimeoutMs: input.outputIdleTimeoutMs ?? null,
      modelPricing: input.modelPricing ?? null,
      costPer1kInput: input.costPer1kInput ?? null,
      costPer1kOutput: input.costPer1kOutput ?? null,
      costCurrency: input.costCurrency ?? null,
      upstreamFormat: input.upstreamFormat,
      chatImplementation: input.chatImplementation ?? null,
      compatibilityExtensionProfile: input.compatibilityExtensionProfile ?? null,
      executionRoutes: input.executionRoutes ?? null,
    });
  }

  private generationPricingError(input: AiTestRuntimeInput, model: string) {
    if (input.testKind !== 'generation') return undefined;
    const pricing = this.pricingForModel(input, model);
    const inputCost = pricing.costPer1kInput;
    const outputCost = pricing.costPer1kOutput;
    if (inputCost === undefined || outputCost === undefined || !pricing.costCurrency)
      return '该模型费用未知或未填写完整，生成测试前请填写输入、输出单价和费用币种';
    const paid = inputCost > 0 || outputCost > 0;
    if (paid && input.budgetAuthorized !== true)
      return '该模型为非零费率，生成测试前需要明确授权本次可能产生费用';
    return undefined;
  }

  private pricingForModel(input: AiTestRuntimeInput, model: string): AiProviderPricing {
    if (input.modelPricing !== undefined) {
      const pricing = input.modelPricing[model];
      return {
        ...(pricing?.costPer1kInput === undefined
          ? {}
          : { costPer1kInput: pricing.costPer1kInput }),
        ...(pricing?.costPer1kOutput === undefined
          ? {}
          : { costPer1kOutput: pricing.costPer1kOutput }),
        ...(pricing?.costCurrency === undefined ? {} : { costCurrency: pricing.costCurrency }),
        ...(pricing?.pricingVersion === undefined
          ? {}
          : { pricingVersion: pricing.pricingVersion }),
      };
    }
    return {
      ...(input.costPer1kInput === undefined ? {} : { costPer1kInput: input.costPer1kInput }),
      ...(input.costPer1kOutput === undefined ? {} : { costPer1kOutput: input.costPer1kOutput }),
      ...(input.costCurrency === undefined ? {} : { costCurrency: input.costCurrency }),
      ...(input.pricingVersion === undefined ? {} : { pricingVersion: input.pricingVersion }),
    };
  }

  private testFacts(
    input: AiTestRuntimeInput,
    model: string,
    result: Pick<
      AiSdkGenerationResult<unknown>,
      'usage' | 'providerCost' | 'providerCostCurrency'
    >,
  ): { usage: AiUsageFacts; cost: AiCostFacts } {
    const usage = result.usage ?? unknownTestUsage();
    const pricing = this.pricingForModel(input, model);
    const providerCurrency = result.providerCostCurrency?.trim().toUpperCase();
    if (
      typeof result.providerCost === 'string' &&
      /^[A-Z]{3}$/u.test(providerCurrency ?? '')
    ) {
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

  private testRecordDetails(
    input: AiTestRuntimeInput,
    model: string,
    facts: { usage: AiUsageFacts; cost: AiCostFacts },
    errorCode?: string,
    status?: AiProviderTestStatus,
  ): Prisma.InputJsonValue {
    const route = input.executionRoutes?.find(
      (candidate) =>
        candidate.model === model && candidate.contract.id === (input.purpose ?? 'research'),
    );
    return {
      kind: 'ai_provider_test',
      testKind: input.testKind,
      model,
      adapter: input.adapter,
      ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
      ...(input.mode === undefined ? {} : { mode: input.mode }),
      ...(route
        ? {
            mode: route.mode,
            contract: route.contract,
          }
        : {}),
      configurationFingerprint: this.runtimeFingerprint(input),
      usage: facts.usage,
      cost: facts.cost,
      ...(errorCode ? { errorCode } : {}),
      ...(status ? { status } : {}),
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

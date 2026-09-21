import {
  BadRequestException,
  BadGatewayException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { loadConfig } from '../platform/config.js';
import { ProviderConfigService } from '../providers/provider-config.service.js';
import { ProviderHealthService, type ProviderState } from '../providers/provider-health.service.js';
import { AiProviderRegistry, routeSnapshotsFromProvider } from './provider-registry.js';
import { createConfiguredAiProviders } from './provider-adapters.js';
import { runProviderConnectionTest } from './provider-connection-test.js';
import { AiSdkGenerationAdapter } from './ai-sdk-generation.adapter.js';
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
  type AiProviderTestResult,
  type AiProviderTestStatus,
  type AiProviderExecutionRouteInput,
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
  aiUpstreamSelectionSchema,
  type AiAdapter,
  type AiChatImplementation,
  type AiUpstreamFormat,
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

export { aiProviderInputSchema, sanitizeAiProviderError } from './ai-provider.contracts.js';

interface DraftTest {
  name: string;
  fingerprint: string;
  credentialHash: string;
  credential: string;
  latencyMs: number;
  checkedAt: Date;
  expiresAt: number;
}

interface AiTestRuntimeInput {
  name: string;
  baseUrl: string;
  models: string[];
  modelReasoning?: Record<string, AiProviderModelReasoning>;
  credential: string;
  enabled: boolean;
  priority: number;
  capabilities: string[];
  timeoutMs?: number;
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

const DRAFT_TTL_MS = 5 * 60 * 1000;

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

  constructor(
    private readonly configs: ProviderConfigService,
    private readonly health: ProviderHealthService,
    private readonly registry: AiProviderRegistry,
    private readonly sdk: AiSdkGenerationAdapter = new AiSdkGenerationAdapter(),
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

  async save(rawInput: unknown) {
    const input = aiProviderInputSchema.parse(rawInput);
    const existing = await this.configs.findStored(input.name);
    const environment = this.environmentProviders();
    const hasInputCredential = Boolean(input.apiKey?.trim() || input.credentialsRef?.trim());
    if (
      !existing &&
      environment.some((provider) => provider.id === input.name) &&
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
      settings: settingsFromAiProviderInput(input, existing?.settings),
      ...(draft ? {} : {}),
    });
    if (draft) await this.recordSavedHealth(input.name, true, draft.latencyMs, draft.checkedAt);
    await this.refreshOrThrow();
    return this.findSummary(input.name, saved.updatedAt?.toISOString?.() ?? null);
  }

  async testDraft(rawInput: unknown): Promise<AiProviderTestResult> {
    const input = aiProviderInputSchema.parse(rawInput);
    const existing = await this.configs.findStored(input.name);
    const credential =
      input.apiKey?.trim() ||
      input.credentialsRef?.trim() ||
      (existing ? await this.configs.readCredential(existing) : '');
    const runtimeInput = this.runtimeInput(input, existing, credential);
    return this.executeTest(runtimeInput, false, this.runtimeFingerprint(runtimeInput));
  }

  async testSaved(name: string): Promise<AiProviderTestResult> {
    const config = await this.configs.findStored(name);
    if (!config || config.type !== 'ai') throw new NotFoundException('AI Provider 配置不存在');
    const settings = parseAiProviderSettings(config.settings);
    if (!settings) return this.configError(name, '保存的 AI Provider 配置无效');
    const result = await this.executeTest(
      {
        ...settings,
        name,
        credential: await this.configs.readCredential(config),
        enabled: config.enabled,
        priority: config.priority,
        capabilities: aiProviderCapabilities(config.capabilities),
      },
      true,
    );
    await this.refreshOrThrow();
    return result;
  }

  async models(rawInput: unknown): Promise<AiProviderModelCatalogResult> {
    const input = aiProviderModelCatalogInputSchema.parse(rawInput);
    const existing = input.name ? await this.configs.findStored(input.name) : undefined;
    if (existing && existing.type !== 'ai')
      throw new ConflictException('同名 Provider 已存在且不是 AI，不能读取其模型目录');
    const suppliedCredential = input.apiKey?.trim() || input.credentialsRef?.trim();
    const existingSettings = existing ? parseAiProviderSettings(existing.settings) : null;
    if (existing && !suppliedCredential) {
      if (!existingSettings) throw new BadRequestException('保存的 AI Provider 配置无效');
      const requestedBaseUrl = input.baseUrl.replace(/\/+$/u, '');
      const savedBaseUrl = existingSettings.baseUrl.replace(/\/+$/u, '');
      if (requestedBaseUrl !== savedBaseUrl)
        throw new BadRequestException('Base URL 已变化，请输入 API Key 后重新获取模型目录');
    }
    const credential =
      suppliedCredential || (existing ? await this.configs.readCredential(existing) : '');
    try {
      const catalog = await fetchAiProviderModelCatalog(
        input.baseUrl,
        credential,
        input.timeoutMs ?? configuredTimeout(),
        input.upstreamFormat ?? existingSettings?.upstreamFormat ?? 'chat-completions',
      );
      return { ...catalog, fetchedAt: new Date().toISOString() };
    } catch (error) {
      throw new BadGatewayException(
        `获取 Provider 模型目录失败：${sanitizeAiProviderError(error, credential)}`,
      );
    }
  }

  async setEnabled(name: string, enabled: boolean) {
    const config = await this.configs.findStored(name);
    if (!config || config.type !== 'ai') {
      if (this.environmentProviders().some((provider) => provider.id === name))
        throw new ConflictException('部署配置不可启停，请先创建数据库配置接管');
      throw new NotFoundException('AI Provider 配置不存在');
    }
    await this.configs.setEnabled(name, enabled);
    await this.refreshOrThrow();
    return this.findSummary(name);
  }

  async remove(name: string) {
    const config = await this.configs.findStored(name);
    if (!config || config.type !== 'ai') {
      if (this.environmentProviders().some((provider) => provider.id === name))
        throw new ConflictException('部署配置不可删除');
      throw new NotFoundException('AI Provider 配置不存在');
    }
    await this.configs.deleteStored(name);
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

  private async executeTest(
    input: AiTestRuntimeInput,
    persist: boolean,
    fingerprint?: string,
  ): Promise<AiProviderTestResult> {
    if (!input.enabled)
      return {
        name: input.name,
        status: 'disabled',
        message: 'Provider 已停用',
        credentialConfigured: Boolean(input.credential),
      };
    if (!input.credential)
      return {
        name: input.name,
        status: 'unconfigured',
        message: '请先配置 API Key，再测试连接',
        credentialConfigured: false,
      };
    const model = input.models[0];
    if (!model) throw new BadRequestException('至少需要一个模型');
    const started = Date.now();
    try {
      const { latencyMs } = await runProviderConnectionTest({
        sdk: this.sdk,
        adapter: input.adapter,
        ...(input.compatibilityExtensionProfile === undefined
          ? {}
          : { compatibilityExtensionProfile: input.compatibilityExtensionProfile }),
        providerId: input.name,
        baseURL: input.baseUrl,
        apiKey: input.credential,
        model,
        timeoutMs: input.timeoutMs ?? 30_000,
      });
      if (!persist) {
        const testToken = randomUUID();
        this.drafts.set(testToken, {
          name: input.name,
          fingerprint: fingerprint ?? this.runtimeFingerprint(input),
          credentialHash: this.credentialHash(input.credential),
          credential: input.credential,
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
          credentialConfigured: true,
          model,
          latencyMs,
          testToken,
        };
      }
      const health = await this.recordSavedHealth(input.name, true, latencyMs);
      return {
        ...health,
        name: input.name,
        message: '测试成功',
        credentialConfigured: true,
        model,
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - started;
      const errorCode = errorCodeFor(error);
      const message = sanitizeAiProviderError(error, input.credential);
      if (!persist)
        return {
          name: input.name,
          status: 'down',
          message,
          credentialConfigured: true,
          model,
          latencyMs,
          errorCode,
        };
      const health = await this.recordSavedHealth(
        input.name,
        false,
        latencyMs,
        new Date(),
        errorCode,
      );
      return {
        name: input.name,
        status: health.status,
        message,
        credentialConfigured: true,
        model,
        latencyMs,
        errorCode,
        healthCheck: health.healthCheck,
      };
    }
  }

  private async recordSavedHealth(
    name: string,
    success: boolean,
    latencyMs: number,
    checkedAt = new Date(),
    errorCode?: string,
  ) {
    const state = await this.health.record(
      name,
      success,
      latencyMs,
      errorCode,
      checkedAt,
      'manual',
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

  private consumeDraft(
    token: string | undefined,
    name: string,
    fingerprint: string,
    credential?: string,
  ) {
    if (!token) return undefined;
    const record = this.drafts.get(token);
    this.deleteDraft(token);
    if (!record || record.name !== name || record.expiresAt <= Date.now())
      throw new BadRequestException('草稿测试令牌无效或已过期');
    if (record.fingerprint !== fingerprint)
      throw new BadRequestException('草稿配置已变化，请重新测试连接');
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
      baseUrl: input.baseUrl,
      models: input.models,
      ...(input.modelReasoning ? { modelReasoning: input.modelReasoning } : {}),
      credential,
      enabled: input.enabled ?? existing?.enabled ?? true,
      priority: input.priority,
      capabilities: input.capabilities ?? ['chat'],
      ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
      ...(input.costPer1kInput === undefined ? {} : { costPer1kInput: input.costPer1kInput }),
      ...(input.costPer1kOutput === undefined ? {} : { costPer1kOutput: input.costPer1kOutput }),
      ...(input.costCurrency === undefined ? {} : { costCurrency: input.costCurrency }),
      ...(input.pricingVersion === undefined ? {} : { pricingVersion: input.pricingVersion }),
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
      timeoutMs: input.timeoutMs ?? null,
      costPer1kInput: input.costPer1kInput ?? null,
      costPer1kOutput: input.costPer1kOutput ?? null,
      costCurrency: input.costCurrency ?? null,
      pricingVersion: input.pricingVersion ?? null,
      upstreamFormat: input.upstreamFormat,
      chatImplementation: input.chatImplementation ?? null,
      compatibilityExtensionProfile: input.compatibilityExtensionProfile ?? null,
      executionRoutes: input.executionRoutes ?? null,
    });
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

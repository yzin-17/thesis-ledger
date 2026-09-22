import { DEFAULT_AI_TIMEOUT_MS, loadConfig } from '../platform/config.js';
import { AiProviderValidationJournal } from './ai-provider-validation-journal.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  aiProviderValidationPlanSchema,
  type AiProviderValidationAuthorization,
} from '@thesis-ledger/schemas';
import { ProviderConfigService } from '../providers/provider-config.service.js';
import { ProviderHealthService } from '../providers/provider-health.service.js';
import { AiProviderService } from './ai-provider.service.js';
import { AiSdkGenerationAdapter } from './ai-sdk-generation.adapter.js';
import {
  aiProviderInputSchema,
  type AiProviderInput,
  type AiProviderLifecycleOptions,
} from './ai-provider.contracts.js';
import { parseAiProviderSettings } from './ai-provider-summary.js';
import {
  readVerifiedRoutes,
  effectiveRoute,
  routeValidationFingerprint,
  validationHash,
  VALIDATION_MAX_CALLS,
  VALIDATION_OUTPUT_TOKENS,
  VALIDATION_DURATION_SECONDS,
  type VerifiedRoute,
} from './ai-provider-validation-policy.js';
import {
  validateProviderRoute,
  validationInputEstimate,
  validationPricing,
  type ValidationRunContext,
} from './ai-provider-validation-runner.js';

@Injectable()
export class AiProviderSaveService {
  private readonly successful = new Map<string, VerifiedRoute>();
  private readonly active = new Map<string, { operationId: string; controller: AbortController }>();

  constructor(
    private readonly providers: AiProviderService,
    private readonly configs: ProviderConfigService,
    private readonly sdk: AiSdkGenerationAdapter,
    private readonly health: ProviderHealthService,
    private readonly journal: AiProviderValidationJournal,
  ) {}

  private async context(raw: unknown) {
    const parsed = aiProviderInputSchema.parse(raw);
    // Resolve the deployed default once; test and saved runtime must use the same limit.
    if (parsed.timeoutMs === undefined) {
      try {
        parsed.timeoutMs = Math.min(loadConfig().aiTimeoutMs, 120000);
      } catch {
        parsed.timeoutMs = DEFAULT_AI_TIMEOUT_MS;
      }
    }
    const row = await this.configs.findStored(parsed.name);
    if (row && parsed.expectedRevision !== row.updatedAt.toISOString())
      throw new ConflictException('配置版本已变化，请刷新后再验证');
    const stored = row ? parseAiProviderSettings(row.settings) : null;
    const credentialSupplied = parsed.apiKey ?? parsed.credentialsRef;
    if (
      row &&
      parsed.authMode === 'api_key' &&
      !credentialSupplied &&
      (!stored || new URL(stored.baseUrl).toString() !== new URL(parsed.baseUrl).toString())
    )
      throw new BadRequestException('服务地址已变化，请重新输入密钥，不能将旧密钥发送到新地址');
    const credential =
      parsed.authMode === 'none'
        ? ''
        : (credentialSupplied ?? (row ? await this.configs.readCredential(row) : ''));
    if (parsed.authMode === 'api_key' && !credential && parsed.enabled !== false)
      throw new BadRequestException('请填写 API Key');
    const modelDefaults = parsed.modelDefaults ?? stored?.modelDefaults;
    const input: AiProviderInput = {
      ...parsed,
      enabled: parsed.enabled ?? row?.enabled ?? true,
      executionRoutes: parsed.executionRoutes ?? stored?.executionRoutes ?? [],
      ...(modelDefaults ? { modelDefaults } : {}),
    };
    input.executionRoutes = input.executionRoutes!.map((route) => effectiveRoute(input, route));
    const enabledRoutes =
      input.enabled === false
        ? []
        : input.executionRoutes.filter((route) => route.enabled !== false);
    if (input.enabled !== false && enabledRoutes.length === 0)
      throw new BadRequestException('启用前请至少选择一个模型用途，或先保存为停用状态');
    const verified = [
      ...readVerifiedRoutes(row?.settings),
      ...(await this.journal.passed(parsed.name)),
    ];
    const routes = enabledRoutes.map((route) => {
      const fingerprint = routeValidationFingerprint(
        input,
        route,
        credential,
        stored?.compatibilityExtensionProfile,
      );
      const record =
        verified.find((item) => item.fingerprint === fingerprint) ??
        this.successful.get(fingerprint);
      return { route, fingerprint, record };
    });
    return { input, row, credential, routes, profile: stored?.compatibilityExtensionProfile };
  }

  private planFor(context: Awaited<ReturnType<AiProviderSaveService['context']>>) {
    const pending = context.routes.filter((item) => !item.record);
    const maxCalls = pending.reduce(
      (sum, item) => sum + (item.route.outputPolicy === 'auto' ? 3 : 1),
      0,
    );
    if (maxCalls > VALIDATION_MAX_CALLS)
      throw new BadRequestException('一次最多验证 24 次请求，请分批启用模型用途');
    const costs = new Map<string, number>();
    for (const { route } of pending) {
      const rates = validationPricing(context.input, route.model);
      const calls = route.outputPolicy === 'auto' ? 3 : 1;
      const estimate =
        (calls *
          (validationInputEstimate(route) * rates.input +
            VALIDATION_OUTPUT_TOKENS * rates.output)) /
        1000;
      costs.set(rates.currency, (costs.get(rates.currency) ?? 0) + estimate);
    }
    return aiProviderValidationPlanSchema.parse({
      planFingerprint: validationHash({
        routes: context.routes.map(({ fingerprint, record }) => ({
          fingerprint,
          mode: record?.mode ?? null,
        })),
        revision: context.row?.updatedAt.toISOString() ?? null,
        input: context.input.modelPricing ?? null,
        legacyPrice: [
          context.input.costPer1kInput,
          context.input.costPer1kOutput,
          context.input.costCurrency,
        ],
        enabled: context.input.enabled,
      }),
      pending: pending.map(({ route }) => ({
        model: route.model,
        purpose: route.contract.id,
        policy: route.outputPolicy ?? 'manual',
      })),
      maxCalls,
      maxOutputTokensPerCall: VALIDATION_OUTPUT_TOKENS,
      maxDurationSeconds: VALIDATION_DURATION_SECONDS,
      estimatedCosts: [...costs].map(([currency, amount]) => ({
        currency,
        amount: String(amount),
      })),
    });
  }

  async plan(raw: unknown) {
    return this.planFor(await this.context(raw));
  }

  private async persist(
    context: Awaited<ReturnType<AiProviderSaveService['context']>>,
    records: VerifiedRoute[],
  ) {
    const routes = context.input.executionRoutes!.map((route) => {
      const record = records.find(
        (item) => item.model === route.model && item.purpose === route.contract.id,
      );
      return record ? { ...route, mode: record.mode } : route;
    });
    const { connectionTestToken: _legacyToken, ...input } = context.input;
    void _legacyToken;
    return this.providers.save({ ...input, executionRoutes: routes }, records);
  }

  /** No external call on the ordinary save endpoint. Client-supplied proof is never accepted. */
  async save(raw: unknown) {
    const context = await this.context(raw);
    if (context.routes.some((item) => !item.record))
      throw new BadRequestException('存在尚未验证的启用用途，请使用“测试并保存”');
    return this.persist(
      context,
      context.routes.flatMap((item) => (item.record ? [item.record] : [])),
    );
  }

  async testAndSave(raw: unknown, authorization: AiProviderValidationAuthorization) {
    const context = await this.context(raw);
    const plan = this.planFor(context);
    if (
      authorization.planFingerprint !== plan.planFingerprint ||
      authorization.maxCalls !== plan.maxCalls
    )
      throw new ConflictException('测试范围或费用已变化，请重新确认');
    if (this.active.has(context.input.name))
      throw new ConflictException('验证正在进行或该操作已使用，请勿重复请求');
    await this.journal.begin(context.input.name, authorization.operationId, plan.planFingerprint);
    const controller = new AbortController();
    this.active.set(context.input.name, { operationId: authorization.operationId, controller });
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(VALIDATION_DURATION_SECONDS * 1000),
    ]);
    const run: ValidationRunContext = {
      input: context.input,
      credential: context.credential,
      operationId: authorization.operationId,
      signal,
      deadline: Date.now() + VALIDATION_DURATION_SECONDS * 1000,
      remainingCalls: authorization.maxCalls,
      allowText: authorization.allowTextFallback,
      ...(context.profile === undefined ? {} : { profile: context.profile }),
    };
    const records: VerifiedRoute[] = [];
    let costUnknown = false;
    try {
      for (const item of context.routes) {
        if (signal.aborted) throw new BadRequestException('验证已取消，原配置未修改');
        if (item.record) {
          records.push(item.record);
          continue;
        }
        if (costUnknown)
          throw new BadRequestException('上次测试费用未知，已停止后续调用，原配置未修改');
        const result = await validateProviderRoute(
          run,
          item.route,
          item.fingerprint,
          this.sdk,
          this.health,
        );
        records.push(result.record);
        this.successful.set(item.fingerprint, result.record);
        if (this.successful.size > 1024)
          this.successful.delete(this.successful.keys().next().value!);
        costUnknown = result.costUnknown;
      }
      if (signal.aborted) throw new BadRequestException('验证已取消，原配置未修改');
      // save() re-reads the revision, then persistence applies its existing CAS fence.
      return await this.persist(context, records);
    } finally {
      this.active.delete(context.input.name);
    }
  }

  cancel(name: string, operationId: string) {
    const active = this.active.get(name);
    if (!active || active.operationId !== operationId) return { cancelled: false };
    active.controller.abort();
    return { cancelled: true };
  }

  async setEnabled(name: string, enabled: boolean, options: AiProviderLifecycleOptions) {
    if (enabled) {
      const row = await this.configs.findStored(name);
      if (!row) throw new NotFoundException('接入配置不存在');
      const settings = parseAiProviderSettings(row.settings);
      if (!settings) throw new BadRequestException('接入配置无效');
      const {
        adapter: _adapter,
        compatibilityExtensionProfile: _profile,
        capabilityRevocations: _revocations,
        pricingVersion: _pricingVersion,
        modelPricing: _pricing,
        ...input
      } = settings;
      void _adapter;
      void _profile;
      void _revocations;
      void _pricingVersion;
      void _pricing;
      const context = await this.context({
        ...input,
        name,
        enabled: true,
        priority: row.priority,
        expectedRevision: options.expectedRevision,
      });
      if (context.routes.some((item) => !item.record))
        throw new BadRequestException('启用前请打开编辑器完成“测试并保存”');
    }
    return this.providers.setEnabled(name, enabled, options);
  }
}

import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ProviderConfig } from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  aiUpstreamSelectionSchema,
  type AiGenerationContractRef,
  type AiGenerationMode,
} from '@thesis-ledger/schemas';
import type { ProviderConfigService } from '../providers/provider-config.service.js';
import { aiProviderCapabilities, parseAiProviderSettings } from './ai-provider-summary.js';
import {
  asRecord,
  type AiProviderInput,
  type AiProviderModelPricingInput,
  type AiProviderModelPricingView,
} from './ai-provider.contracts.js';
import { configurationFingerprint, type AiProviderRouteSnapshot } from './ai-provider-readiness.js';

const pricingVersionFor = (model: string, pricing: AiProviderModelPricingInput) =>
  `pricing-${createHash('sha256')
    .update(JSON.stringify({ model, ...pricing }), 'utf8')
    .digest('hex')
    .slice(0, 16)}`;

const samePricing = (
  left: AiProviderModelPricingInput | undefined,
  right: AiProviderModelPricingInput | undefined,
) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

const pricingFields = (
  value: AiProviderModelPricingInput | AiProviderModelPricingView | undefined,
) => {
  if (!value) return undefined;
  return {
    ...(value.costPer1kInput === undefined ? {} : { costPer1kInput: value.costPer1kInput }),
    ...(value.costPer1kOutput === undefined ? {} : { costPer1kOutput: value.costPer1kOutput }),
    ...(value.costCurrency === undefined ? {} : { costCurrency: value.costCurrency }),
  } satisfies AiProviderModelPricingInput;
};

const legacyPricing = (
  input: AiProviderInput,
  existing: ReturnType<typeof parseAiProviderSettings>,
): AiProviderModelPricingInput | undefined => {
  const costPer1kInput = input.costPer1kInput ?? existing?.costPer1kInput;
  const costPer1kOutput = input.costPer1kOutput ?? existing?.costPer1kOutput;
  const costCurrency = input.costCurrency ?? existing?.costCurrency;
  if (costPer1kInput === undefined && costPer1kOutput === undefined && costCurrency === undefined)
    return undefined;
  return {
    ...(costPer1kInput === undefined ? {} : { costPer1kInput }),
    ...(costPer1kOutput === undefined ? {} : { costPer1kOutput }),
    ...(costCurrency === undefined ? {} : { costCurrency }),
  };
};

const modelPricingFromInput = (
  input: AiProviderInput,
  models: readonly string[],
  existing: ReturnType<typeof parseAiProviderSettings>,
): Record<string, AiProviderModelPricingView> => {
  const explicit = input.modelPricing !== undefined;
  const oldPricing = legacyPricing(input, existing);
  return Object.fromEntries(
    models.flatMap((model) => {
      const previous = existing?.modelPricing?.[model];
      const sourcePricing = explicit
        ? input.modelPricing?.[model]
        : (pricingFields(previous) ?? oldPricing);
      if (!sourcePricing) return [];
      if (previous && samePricing(pricingFields(previous), sourcePricing))
        return [[model, previous] as const];
      return [
        [
          model,
          {
            ...sourcePricing,
            pricingVersion: pricingVersionFor(model, sourcePricing),
            updatedAt: new Date().toISOString(),
            source: explicit ? ('user' as const) : ('legacy_provider' as const),
          },
        ] as const,
      ];
    }),
  );
};

export const settingsFromAiProviderInput = (input: AiProviderInput, existingSettings?: unknown) => {
  const existing = parseAiProviderSettings(existingSettings);
  const selection = aiUpstreamSelectionSchema.parse({
    upstreamFormat: input.upstreamFormat,
    ...(input.chatImplementation === undefined
      ? {}
      : { chatImplementation: input.chatImplementation }),
  });
  const executionRoutes =
    input.executionRoutes !== undefined ? input.executionRoutes : existing?.executionRoutes;
  const modelDefaults = input.modelDefaults ?? existing?.modelDefaults;
  const models = [...new Set(input.models.map((model) => model.trim()))];
  const modelPricing = modelPricingFromInput(input, models, existing);
  const legacySettingsFields =
    input.modelPricing === undefined
      ? {
          ...(input.costPer1kInput === undefined ? {} : { costPer1kInput: input.costPer1kInput }),
          ...(input.costPer1kOutput === undefined
            ? {}
            : { costPer1kOutput: input.costPer1kOutput }),
          ...(input.costCurrency === undefined ? {} : { costCurrency: input.costCurrency }),
        }
      : {};
  return {
    baseUrl: input.baseUrl,
    models,
    authMode: input.authMode,
    upstreamFormat: selection.upstreamFormat,
    ...(selection.upstreamFormat === 'chat-completions'
      ? { chatImplementation: selection.chatImplementation }
      : {}),
    ...(existing?.compatibilityExtensionProfile
      ? { compatibilityExtensionProfile: existing.compatibilityExtensionProfile }
      : {}),
    ...(executionRoutes === undefined ? {} : { executionRoutes }),
    ...(modelDefaults === undefined ? {} : { modelDefaults }),
    modelPricing,
    ...(existing?.capabilityRevocations
      ? { capabilityRevocations: existing.capabilityRevocations }
      : {}),
    ...(input.modelReasoning
      ? {
          modelReasoning: Object.fromEntries(
            Object.entries(input.modelReasoning).filter(([model]) => input.models.includes(model)),
          ),
        }
      : {}),
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    ...(input.firstOutputTimeoutMs === undefined
      ? {}
      : { firstOutputTimeoutMs: input.firstOutputTimeoutMs }),
    ...(input.outputIdleTimeoutMs === undefined
      ? {}
      : { outputIdleTimeoutMs: input.outputIdleTimeoutMs }),
    ...legacySettingsFields,
  };
};

export const routeSnapshotsFromProviderRow = (
  row: ProviderConfig,
  settings: ReturnType<typeof parseAiProviderSettings>,
  health: string,
): AiProviderRouteSnapshot[] => {
  if (!settings?.executionRoutes) return [];
  const credentialFingerprint = row.encryptedCredentials
    ? createHash('sha256').update(row.encryptedCredentials).digest('hex')
    : null;
  return settings.executionRoutes.filter((route) => route.enabled !== false).map((route) => {
    const modelPricing = settings.modelPricing?.[route.model];
    const legacyPricing = {
      ...(settings.costPer1kInput === undefined ? {} : { costPer1kInput: settings.costPer1kInput }),
      ...(settings.costPer1kOutput === undefined
        ? {}
        : { costPer1kOutput: settings.costPer1kOutput }),
      ...(settings.costCurrency === undefined ? {} : { costCurrency: settings.costCurrency }),
      ...(settings.pricingVersion === undefined ? {} : { pricingVersion: settings.pricingVersion }),
    };
    const routePricing = modelPricing
      ? {
          ...pricingFields(modelPricing),
          pricingVersion: modelPricing.pricingVersion,
        }
      : legacyPricing;
    return {
      providerId: row.name,
      baseUrl: settings.baseUrl,
      upstreamFormat: settings.upstreamFormat,
      ...(settings.chatImplementation === undefined
        ? {}
        : { chatImplementation: settings.chatImplementation }),
      ...(settings.compatibilityExtensionProfile === undefined
        ? {}
        : { compatibilityExtensionProfile: settings.compatibilityExtensionProfile }),
      adapter: settings.adapter ?? null,
      models: settings.models,
      route,
      ...(settings.firstOutputTimeoutMs === undefined
        ? {}
        : { firstOutputTimeoutMs: settings.firstOutputTimeoutMs }),
      ...(settings.outputIdleTimeoutMs === undefined
        ? {}
        : { outputIdleTimeoutMs: settings.outputIdleTimeoutMs }),
      ...(routePricing.costPer1kInput === undefined
        ? {}
        : { costPer1kInput: routePricing.costPer1kInput }),
      ...(routePricing.costPer1kOutput === undefined
        ? {}
        : { costPer1kOutput: routePricing.costPer1kOutput }),
      ...(routePricing.costCurrency === undefined
        ? {}
        : { costCurrency: routePricing.costCurrency }),
      ...(routePricing.pricingVersion === undefined
        ? {}
        : { pricingVersion: routePricing.pricingVersion }),
      enabled: row.enabled,
      health,
      credentialFingerprint,
      revocations: settings.capabilityRevocations ?? [],
    };
  });
};

export type AiCapabilityRevocationInput = {
  providerId: string;
  model: string;
  mode: AiGenerationMode;
  contract: AiGenerationContractRef;
  reason: string;
};

export const persistAiCapabilityRevocation = async (
  configs: ProviderConfigService,
  input: AiCapabilityRevocationInput,
) => {
  const row = await configs.findStored(input.providerId);
  if (!row || row.type !== 'ai')
    throw new NotFoundException('只能撤销数据库来源的 AI Provider 执行能力');
  const settings = parseAiProviderSettings(row.settings);
  const snapshot = routeSnapshotsFromProviderRow(row, settings, row.health).find(
    (candidate) =>
      candidate.route.model === input.model &&
      candidate.route.mode === input.mode &&
      candidate.route.contract.id === input.contract.id &&
      candidate.route.contract.version === input.contract.version,
  );
  if (!snapshot) throw new NotFoundException('AI Provider 执行路由不存在');
  const reason = input.reason.trim().slice(0, 240);
  if (!reason) throw new BadRequestException('能力撤销必须说明原因');
  const nextRevocation = {
    model: input.model,
    mode: input.mode,
    contract: input.contract,
    configurationFingerprint: configurationFingerprint(snapshot),
    reason,
    revokedAt: new Date().toISOString(),
  };
  const existing = settings?.capabilityRevocations ?? [];
  const duplicate = existing.some(
    (revocation) =>
      revocation.model === nextRevocation.model &&
      revocation.mode === nextRevocation.mode &&
      revocation.contract.id === nextRevocation.contract.id &&
      revocation.contract.version === nextRevocation.contract.version &&
      revocation.configurationFingerprint === nextRevocation.configurationFingerprint,
  );
  await configs.saveAi({
    name: row.name,
    enabled: row.enabled,
    priority: row.priority,
    capabilities: aiProviderCapabilities(row.capabilities),
    expectedRevision: row.updatedAt.toISOString(),
    settings: {
      ...(asRecord(row.settings) ?? {}),
      capabilityRevocations: duplicate ? existing : [...existing, nextRevocation],
    },
  });
};

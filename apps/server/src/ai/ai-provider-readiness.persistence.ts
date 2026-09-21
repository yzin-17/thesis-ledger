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
import { asRecord, type AiProviderInput } from './ai-provider.contracts.js';
import { configurationFingerprint, type AiProviderRouteSnapshot } from './ai-provider-readiness.js';

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
  return {
    baseUrl: input.baseUrl,
    models: [...new Set(input.models.map((model) => model.trim()))],
    upstreamFormat: selection.upstreamFormat,
    ...(selection.upstreamFormat === 'chat-completions'
      ? { chatImplementation: selection.chatImplementation }
      : {}),
    ...(existing?.compatibilityExtensionProfile
      ? { compatibilityExtensionProfile: existing.compatibilityExtensionProfile }
      : {}),
    ...(executionRoutes === undefined ? {} : { executionRoutes }),
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
    ...(input.costPer1kInput === undefined ? {} : { costPer1kInput: input.costPer1kInput }),
    ...(input.costPer1kOutput === undefined ? {} : { costPer1kOutput: input.costPer1kOutput }),
    ...(input.costCurrency === undefined ? {} : { costCurrency: input.costCurrency }),
    ...(input.pricingVersion === undefined ? {} : { pricingVersion: input.pricingVersion }),
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
  return settings.executionRoutes.map((route) => ({
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
    enabled: row.enabled,
    health,
    credentialFingerprint,
    revocations: settings.capabilityRevocations ?? [],
  }));
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
    settings: {
      ...(asRecord(row.settings) ?? {}),
      capabilityRevocations: duplicate ? existing : [...existing, nextRevocation],
    },
  });
};

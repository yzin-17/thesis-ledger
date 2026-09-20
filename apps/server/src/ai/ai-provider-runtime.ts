import { createHash } from 'node:crypto';
import type { ProviderConfig } from '@prisma/client';
import type { ProviderConfigService } from '../providers/provider-config.service.js';
import type { AiProvider } from './contracts.js';
import { OpenAiCompatibleProvider } from './provider-adapters.js';
import {
  aiProviderCapabilities,
  healthValue,
  parseAiProviderSettings,
} from './ai-provider-summary.js';
import { inferLegacyAiAdapter } from './ai-provider-readiness.js';

export const createStoredAiProvider = async (
  row: ProviderConfig,
  configs: ProviderConfigService,
  fallbackTimeoutMs: number,
): Promise<AiProvider | null> => {
  const settings = parseAiProviderSettings(row.settings);
  const credential = await configs.readCredential(row).catch(() => '');
  if (!settings || !credential || !row.enabled) return null;
  const adapter = settings.adapter ?? inferLegacyAiAdapter(settings.baseUrl);
  return new OpenAiCompatibleProvider(
    row.name,
    settings.models,
    settings.baseUrl,
    credential,
    settings.timeoutMs ?? fallbackTimeoutMs,
    {
      ...(settings.costPer1kInput === undefined
        ? {}
        : { costPer1kInput: settings.costPer1kInput }),
      ...(settings.costPer1kOutput === undefined
        ? {}
        : { costPer1kOutput: settings.costPer1kOutput }),
      ...(settings.costCurrency ? { costCurrency: settings.costCurrency } : {}),
      ...(settings.pricingVersion ? { pricingVersion: settings.pricingVersion } : {}),
    },
    {
      priority: row.priority,
      capabilities: aiProviderCapabilities(row.capabilities),
      health: healthValue(row.health),
      source: 'database',
      ...(settings.modelReasoning ? { modelReasoning: settings.modelReasoning } : {}),
      ...(adapter ? { adapter } : {}),
      ...(settings.executionRoutes ? { executionRoutes: settings.executionRoutes } : {}),
      ...(settings.capabilityRevocations
        ? { capabilityRevocations: settings.capabilityRevocations }
        : {}),
      credentialFingerprint: createHash('sha256').update(credential, 'utf8').digest('hex'),
    },
  );
};

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

export const createStoredAiProvider = async (
  row: ProviderConfig,
  configs: ProviderConfigService,
  fallbackTimeoutMs: number,
): Promise<AiProvider | null> => {
  const settings = parseAiProviderSettings(row.settings);
  if (!settings || !row.enabled) return null;
  const credential =
    settings.authMode === 'none' ? '' : await configs.readCredential(row).catch(() => '');
  if (settings.authMode === 'api_key' && !credential) return null;
  return new OpenAiCompatibleProvider(
    row.name,
    settings.models,
    settings.baseUrl,
    credential,
    settings.timeoutMs ?? fallbackTimeoutMs,
    {
      ...(settings.costPer1kInput === undefined ? {} : { costPer1kInput: settings.costPer1kInput }),
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
      authMode: settings.authMode,
      ...(settings.firstOutputTimeoutMs === undefined
        ? {}
        : { firstOutputTimeoutMs: settings.firstOutputTimeoutMs }),
      ...(settings.outputIdleTimeoutMs === undefined
        ? {}
        : { outputIdleTimeoutMs: settings.outputIdleTimeoutMs }),
      ...(settings.modelReasoning ? { modelReasoning: settings.modelReasoning } : {}),
      upstreamFormat: settings.upstreamFormat,
      ...(settings.chatImplementation ? { chatImplementation: settings.chatImplementation } : {}),
      ...(settings.compatibilityExtensionProfile
        ? { compatibilityExtensionProfile: settings.compatibilityExtensionProfile }
        : {}),
      ...(settings.adapter ? { adapter: settings.adapter } : {}),
      ...(settings.executionRoutes ? { executionRoutes: settings.executionRoutes } : {}),
      ...(settings.modelPricing ? { modelPricing: settings.modelPricing } : {}),
      ...(settings.capabilityRevocations
        ? { capabilityRevocations: settings.capabilityRevocations }
        : {}),
      ...(credential
        ? { credentialFingerprint: createHash('sha256').update(credential, 'utf8').digest('hex') }
        : {}),
    },
  );
};

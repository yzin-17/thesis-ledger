import { ConflictException } from '@nestjs/common';
import type { ProviderConfigService } from '../providers/provider-config.service.js';
import type { AiProviderInput } from './ai-provider.contracts.js';
import { parseAiProviderSettings } from './ai-provider-summary.js';
import { settingsFromAiProviderInput } from './ai-provider-readiness.persistence.js';
import type { VerifiedRoute } from './ai-provider-validation-policy.js';

type StoredProvider = Awaited<ReturnType<ProviderConfigService['findStored']>>;

export function assertAiProviderSaveRevision(input: AiProviderInput, existing: StoredProvider) {
  if (existing) {
    if (!input.expectedRevision) throw new ConflictException('Provider 配置已存在，请刷新后再保存');
    if (input.expectedRevision !== existing.updatedAt.toISOString())
      throw new ConflictException('Provider 配置已变化，请刷新后重试');
    const existingSettings = parseAiProviderSettings(existing.settings);
    if (existingSettings?.modelPricing && input.modelPricing === undefined)
      throw new ConflictException('当前 Provider 含模型级价格，请使用新版完整配置后再保存');
  }
}

export function aiProviderSaveInput(
  input: AiProviderInput,
  existing: StoredProvider,
  credential: string | undefined,
  verifiedRoutes: VerifiedRoute[] | undefined,
): Parameters<ProviderConfigService['saveAi']>[0] {
  return {
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
    ...(input.expectedRevision === undefined ? {} : { expectedRevision: input.expectedRevision }),
  };
}

import { BadGatewayException, BadRequestException, ConflictException } from '@nestjs/common';
import type { ProviderConfigService } from '../providers/provider-config.service.js';
import {
  aiProviderModelCatalogInputSchema,
  sanitizeAiProviderError,
} from './ai-provider.contracts.js';
import { parseAiProviderSettings } from './ai-provider-summary.js';
import { fetchAiProviderModelCatalog } from './ai-provider-model-catalog.js';

const resolveCatalogConnection = async (
  input: ReturnType<typeof aiProviderModelCatalogInputSchema.parse>,
  configs: Pick<ProviderConfigService, 'findStored' | 'readCredential'>,
) => {
  const existing = input.name ? await configs.findStored(input.name) : undefined;
  if (existing && existing.type !== 'ai')
    throw new ConflictException('同名 Provider 已存在且不是 AI，不能读取其模型目录');
  const suppliedCredential = input.apiKey?.trim() || input.credentialsRef?.trim();
  const settings = existing ? parseAiProviderSettings(existing.settings) : null;
  if (existing && !settings) throw new BadRequestException('保存的 AI Provider 配置无效');
  if (existing && input.authMode === 'api_key' && !suppliedCredential) {
    if (input.baseUrl.replace(/\/+$/u, '') !== settings!.baseUrl.replace(/\/+$/u, ''))
      throw new BadRequestException('Base URL 已变化，请输入 API Key 后重新获取模型目录');
  }
  const credential =
    input.authMode === 'none'
      ? ''
      : suppliedCredential || (existing ? await configs.readCredential(existing) : '');
  return { settings, credential };
};

export const queryAiProviderModels = async (
  rawInput: unknown,
  configs: Pick<ProviderConfigService, 'findStored' | 'readCredential'>,
) => {
  const input = aiProviderModelCatalogInputSchema.parse(rawInput);
  const { settings, credential } = await resolveCatalogConnection(input, configs);
  const config = input.modelCatalog === undefined ? settings?.modelCatalog : input.modelCatalog;
  try {
    const catalog = await fetchAiProviderModelCatalog(
      input.baseUrl,
      credential,
      input.timeoutMs ?? settings?.timeoutMs,
      input.upstreamFormat ?? settings?.upstreamFormat ?? 'chat-completions',
      input.authMode,
      config,
    );
    return { ...catalog, fetchedAt: new Date().toISOString() };
  } catch (error) {
    throw new BadGatewayException(
      `获取 Provider 模型目录失败：${sanitizeAiProviderError(error, credential)}`,
    );
  }
};

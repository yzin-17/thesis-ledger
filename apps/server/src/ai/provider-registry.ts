import { Injectable } from '@nestjs/common';
import type { AiProvider } from './contracts.js';

const safeErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : '调用失败';
  return message
    .replace(/Bearer\s+\S+/giu, 'Bearer [REDACTED]')
    .replace(/(?:sk-|api[_-]?key[=:])\S+/giu, '[REDACTED]')
    .slice(0, 240);
};

@Injectable()
export class AiProviderRegistry {
  private readonly providers = new Map<string, AiProvider>();

  register(provider: AiProvider) {
    this.providers.set(provider.id, provider);
  }

  list() {
    return [...this.providers.values()].map((provider) => ({
      id: provider.id,
      models: [...provider.models],
      metadata: provider.metadata ?? {},
    }));
  }

  health() {
    return this.list().map((provider) => ({
      ...provider,
      health: provider.metadata?.health ?? 'unknown',
    }));
  }

  hasProviders() {
    return this.providers.size > 0;
  }

  defaultModel() {
    const provider = [...this.providers.values()].find((item) => item.metadata?.health !== 'down');
    return provider?.models[0];
  }

  route(preferred: string | undefined, model: string) {
    const direct = preferred ? this.providers.get(preferred) : undefined;
    if (direct?.models.includes(model)) return direct;
    const fallback = [...this.providers.values()].find((provider) =>
      provider.models.includes(model),
    );
    if (!fallback) throw new Error(`没有支持模型 ${model} 的 AI Provider`);
    return fallback;
  }

  candidates(model: string, preferred?: string) {
    return [...this.providers.values()]
      .filter((provider) => provider.models.includes(model))
      .sort((left, right) => {
        if (left.id === preferred) return -1;
        if (right.id === preferred) return 1;
        const priorityDelta = (right.metadata?.priority ?? 0) - (left.metadata?.priority ?? 0);
        if (priorityDelta !== 0) return priorityDelta;
        return left.id.localeCompare(right.id);
      });
  }
}

export const completeWithFallback = async (
  registry: AiProviderRegistry,
  input: { model: string; messages: unknown[]; tools: string[]; preferred?: string },
) => {
  const errors: string[] = [];
  for (const provider of registry.candidates(input.model, input.preferred)) {
    try {
      const result = await provider.complete(input, AbortSignal.timeout(30_000));
      return { ...result, provider: provider.id, fallbackErrors: errors };
    } catch (error) {
      errors.push(`${provider.id}: ${safeErrorMessage(error)}`);
    }
  }
  throw new AggregateError(errors, `没有可用的 AI Provider: ${input.model}`);
};

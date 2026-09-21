import { Injectable } from '@nestjs/common';
import type { AiGenerationContractRef, AiGenerationMode } from '@thesis-ledger/schemas';
import type { AiProvider } from './contracts.js';
import {
  evaluateAiProviderReadiness,
  type AiProviderRouteSnapshot,
} from './ai-provider-readiness.js';

@Injectable()
export class AiProviderRegistry {
  private providers = new Map<string, AiProvider>();
  private routes = new Map<string, AiProviderRouteSnapshot>();

  register(provider: AiProvider) {
    this.providers.set(provider.id, provider);
    for (const route of routeSnapshotsFromProvider(provider))
      this.routes.set(
        routeKey(provider.id, route.route.model, route.route.mode, route.route.contract),
        route,
      );
  }

  /** Replace the complete snapshot in one synchronous operation. */
  replace(providers: readonly AiProvider[], routeSnapshots?: readonly AiProviderRouteSnapshot[]) {
    const next = new Map<string, AiProvider>();
    for (const provider of providers) {
      if (!provider.id || provider.models.length === 0) throw new Error('AI Provider 快照无效');
      if (next.has(provider.id)) throw new Error(`AI Provider id 重复: ${provider.id}`);
      next.set(provider.id, provider);
    }
    const nextRoutes = new Map<string, AiProviderRouteSnapshot>();
    const snapshots =
      routeSnapshots ?? providers.flatMap((provider) => routeSnapshotsFromProvider(provider));
    for (const snapshot of snapshots) {
      const key = routeKey(
        snapshot.providerId,
        snapshot.route.model,
        snapshot.route.mode,
        snapshot.route.contract,
      );
      if (nextRoutes.has(key)) throw new Error(`AI Provider 执行路由重复: ${key}`);
      nextRoutes.set(key, snapshot);
    }
    this.providers = next;
    this.routes = nextRoutes;
  }

  list() {
    return [...this.providers.values()].map((provider) => {
      const metadata = { ...(provider.metadata ?? {}) };
      delete metadata.credentialFingerprint;
      delete metadata.capabilityRevocations;
      delete metadata.executionRoutes;
      return { id: provider.id, models: [...provider.models], metadata };
    });
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

  /** Optimization experiments must never silently substitute another provider or model. */
  strict(providerId: string, model: string) {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`AI Provider 未配置: ${providerId}`);
    if (!provider.models.includes(model))
      throw new Error(`AI Provider ${providerId} 不支持模型 ${model}`);
    if (provider.metadata?.health === 'down') throw new Error(`AI Provider 不可用: ${providerId}`);
    return provider;
  }

  readiness(providerId: string, budgetAuthorized = false) {
    return [...this.routes.values()]
      .filter((snapshot) => snapshot.providerId === providerId)
      .map((snapshot) => evaluateAiProviderReadiness(snapshot, { budgetAuthorized }));
  }

  strictReady(input: {
    providerId: string;
    model: string;
    mode: AiGenerationMode;
    contract: AiGenerationContractRef;
    budgetAuthorized: boolean;
  }) {
    const snapshot = this.routes.get(
      routeKey(input.providerId, input.model, input.mode, input.contract),
    );
    if (!snapshot)
      throw new Error(`AI Provider 执行路由未配置: ${input.providerId}/${input.model}`);
    const execution = evaluateAiProviderReadiness(snapshot, {
      budgetAuthorized: input.budgetAuthorized,
    });
    if (execution.readiness.state !== 'ready')
      throw new Error(`AI Provider 执行路由未就绪: ${execution.readiness.reasons.join(',')}`);
    return { provider: this.strict(input.providerId, input.model), execution };
  }

  strictReadyContract(input: {
    providerId: string;
    model: string;
    contract: AiGenerationContractRef;
    budgetAuthorized: boolean;
  }) {
    const candidates = [...this.routes.values()].filter(
      (snapshot) =>
        snapshot.providerId === input.providerId &&
        snapshot.route.model === input.model &&
        snapshot.route.contract.id === input.contract.id &&
        snapshot.route.contract.version === input.contract.version,
    );
    if (candidates.length === 0)
      throw new Error(`AI Provider 生成契约路由未配置: ${input.providerId}/${input.model}`);
    const evaluated = candidates.map((snapshot) => ({
      snapshot,
      execution: evaluateAiProviderReadiness(snapshot, {
        budgetAuthorized: input.budgetAuthorized,
      }),
    }));
    const ready = evaluated.filter((candidate) => candidate.execution.readiness.state === 'ready');
    if (ready.length !== 1) {
      const reasons = evaluated.flatMap((candidate) => candidate.execution.readiness.reasons);
      if (ready.length > 1) reasons.push('configuration_invalid');
      throw new Error(`AI Provider 生成契约路由未就绪: ${[...new Set(reasons)].join(',')}`);
    }
    const selected = ready[0]!;
    return {
      provider: this.strict(input.providerId, input.model),
      execution: selected.execution,
    };
  }

  readyContractCandidates(input: {
    model: string;
    contract: AiGenerationContractRef;
    preferred?: string;
    budgetAuthorized: (providerId: string, model: string) => boolean;
  }) {
    return this.candidates(input.model, input.preferred).flatMap((provider) => {
      try {
        return [
          this.strictReadyContract({
            providerId: provider.id,
            model: input.model,
            contract: input.contract,
            budgetAuthorized: input.budgetAuthorized(provider.id, input.model),
          }),
        ];
      } catch {
        return [];
      }
    });
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

const routeKey = (
  providerId: string,
  model: string,
  mode: AiGenerationMode,
  contract: AiGenerationContractRef,
) => `${providerId}\u0000${model}\u0000${mode}\u0000${contract.id}\u0000${contract.version}`;

export const routeSnapshotsFromProvider = (provider: AiProvider): AiProviderRouteSnapshot[] => {
  const metadata = provider.metadata;
  const baseUrl = metadata?.baseURL ?? '';
  const upstreamFormat = metadata?.upstreamFormat ?? 'chat-completions';
  const chatImplementation =
    upstreamFormat === 'chat-completions'
      ? (metadata?.chatImplementation ?? 'compatible')
      : undefined;
  return (metadata?.executionRoutes ?? []).map((route) => ({
    providerId: provider.id,
    baseUrl,
    upstreamFormat,
    ...(chatImplementation === undefined ? {} : { chatImplementation }),
    ...(metadata?.compatibilityExtensionProfile === undefined
      ? {}
      : { compatibilityExtensionProfile: metadata.compatibilityExtensionProfile }),
    adapter: metadata?.adapter ?? null,
    models: provider.models,
    route,
    enabled: true,
    health: metadata?.health ?? 'unknown',
    credentialFingerprint: metadata?.credentialFingerprint ?? null,
    revocations: metadata?.capabilityRevocations ?? [],
  }));
};

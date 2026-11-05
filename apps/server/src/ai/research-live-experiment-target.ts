import type { LiveExperimentProtocol } from './research-live-experiment-protocol.js';

/** 本地无限调用只限封存目标；外部Provider继续使用原官方端点和凭据要求。 */
export function liveExperimentTargetMatches(
  protocol: LiveExperimentProtocol,
  binding: { baseURL: string; apiKey: string },
) {
  const base = new URL(binding.baseURL);
  if (base.username || base.password || base.search || base.hash) return false;
  if (protocol.version === 'research-live-experiment-v6') {
    return binding.baseURL === protocol.localTarget.baseURL && binding.apiKey === '';
  }
  if (!binding.apiKey) return false;
  if (protocol.model.providerId === 'openrouter') {
    return base.origin === 'https://openrouter.ai' && /^\/api\/v1\/?$/.test(base.pathname);
  }
  return (
    base.origin === 'https://api.cloudflare.com' &&
    /^\/client\/v4\/accounts\/[^/]+\/ai\/v1\/?$/.test(base.pathname)
  );
}

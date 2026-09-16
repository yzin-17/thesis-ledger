import { getDesktopApiClient } from '../../shared/api/client.js';
import type { ProviderOAuthSession } from '@thesis-ledger/schemas';
export type { ProviderOAuthSession } from '@thesis-ledger/schemas';

const base = '/api/v2/market-data/providers/longbridge/oauth/sessions';
export const createProviderOAuth = (clientId: string) =>
  getDesktopApiClient().request<ProviderOAuthSession>(base, {
    method: 'POST',
    body: JSON.stringify({ clientId }),
  });
export const currentProviderOAuth = (signal?: AbortSignal) =>
  getDesktopApiClient().request<{ session: ProviderOAuthSession | null }>(`${base}/current`, {
    signal: signal ?? null,
  });
export const getProviderOAuth = (id: string, signal?: AbortSignal) =>
  getDesktopApiClient().request<ProviderOAuthSession>(`${base}/${encodeURIComponent(id)}`, {
    signal: signal ?? null,
  });
export const cancelProviderOAuth = (id: string) =>
  getDesktopApiClient().request<ProviderOAuthSession>(`${base}/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  });

export const oauthPending = (session?: ProviderOAuthSession | null) =>
  session?.status === 'starting' || session?.status === 'authorizing';

export function safeOAuthUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      ![
        'openapi.longbridge.com',
        'openapi.longbridge.cn',
        'openapi-global.longbridge.xyz',
      ].includes(url.hostname) ||
      url.pathname !== '/oauth2/authorize' ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443')
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export const oauthErrorLabels: Record<string, string> = {
  OAUTH_SDK_UNAVAILABLE: '当前服务尚未安装授权组件，请更新 DSA 服务或使用三项密钥。',
  OAUTH_PORT_IN_USE: '本机授权回调端口被占用，请关闭另一处授权后重试。',
  OAUTH_DENIED: '你已拒绝本次授权，原凭证保持不变。',
  OAUTH_CONFIG_CHANGED: '凭证已被其他操作修改，请重新发起授权。',
  OAUTH_EXPIRED: '授权已超时，请重新发起。',
  OAUTH_RESTARTED: '服务重启中断了授权，请重新发起。',
  OAUTH_NETWORK_ERROR: '授权服务暂时不可达，请稍后重试。',
};

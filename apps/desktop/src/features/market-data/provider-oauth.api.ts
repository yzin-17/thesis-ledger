import { getDesktopApiClient } from '../../shared/api/client.js';
export { safeProviderOAuthUrl as safeOAuthUrl } from '@thesis-ledger/api-client';
import type { ProviderOAuthSession } from '@thesis-ledger/schemas';
export type { ProviderOAuthSession } from '@thesis-ledger/schemas';
export const createProviderOAuth = (clientId: string) =>
  getDesktopApiClient().providerOAuth.create(clientId);
export const currentProviderOAuth = (signal?: AbortSignal) =>
  getDesktopApiClient().providerOAuth.current(signal);
export const getProviderOAuth = (id: string, signal?: AbortSignal) =>
  getDesktopApiClient().providerOAuth.get(id, signal);
export const cancelProviderOAuth = (id: string) => getDesktopApiClient().providerOAuth.cancel(id);
export const oauthPending = (session?: ProviderOAuthSession | null) =>
  session?.status === 'starting' || session?.status === 'authorizing';

export const oauthErrorLabels: Record<string, string> = {
  OAUTH_SDK_UNAVAILABLE: '当前服务尚未安装授权组件，请更新 DSA 服务或使用三项密钥。',
  OAUTH_PORT_IN_USE: '本机授权回调端口被占用，请关闭另一处授权后重试。',
  OAUTH_DENIED: '你已拒绝本次授权，原凭证保持不变。',
  OAUTH_CONFIG_CHANGED: '凭证已被其他操作修改，请重新发起授权。',
  OAUTH_EXPIRED: '授权已超时，请重新发起。',
  OAUTH_RESTARTED: '服务重启中断了授权，请重新发起。',
  OAUTH_NETWORK_ERROR: '授权服务暂时不可达，请稍后重试。',
};

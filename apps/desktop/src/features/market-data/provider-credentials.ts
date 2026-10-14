import type { ProviderCredentialDraft, ProviderManifest } from './market-data.types.js';
import { marketCapabilityLabel } from './market-data-routes-v3.js';

const testErrors: Record<string, string> = {
  unauthorized: '凭证无效或已过期',
  authentication_failed: '凭证无效或已过期',
  forbidden: '当前账户没有所需权限',
  permission_denied: '当前账户没有所需权限',
  rate_limited: '请求频率受限，请稍后重试',
  timeout: '请求超时',
  network_error: '网络暂不可达',
  network_failure: '网络暂不可达或请求超时',
  not_configured: '凭证尚未配置',
  credential_missing: '凭证尚未配置',
  dependency_missing: '运行环境缺少来源依赖',
  not_admitted: '来源尚未准入',
  admission_invalid: '来源准入已失效',
  not_adapted: '该来源尚未接入此能力',
  invalid_response: '来源响应未通过身份、日期或字段检查',
  insufficient_coverage: '来源未覆盖检查区间',
  PROVIDER_CREDENTIAL_CHANGED: '检查期间凭证发生变化，请重新检查',
  ROUTE_CATALOG_CHANGED: '检查期间能力或准入发生变化，请重新检查',
  not_tested: '尚未检查此能力',
  probe_busy: '其他能力仍在检查，请稍后重试',
  not_covered: '未返回测试标的数据',
  fixture_mode: '当前服务使用模拟数据，未进行真实连接测试',
  OAUTH_REAUTH_REQUIRED: '授权已失效，请重新进行浏览器授权',
  OAUTH_SDK_UNAVAILABLE: '服务缺少浏览器授权组件，请更新 DSA 服务',
  OAUTH_CREDENTIAL_INVALID: '已保存的授权无效，请重新授权',
  SECRET_CREDENTIAL_INVALID: '已保存的凭证无法使用，请重新配置',
};

export const providerProbeErrorLabel = (code: string | undefined) =>
  testErrors[code ?? ''] ?? '来源读取检查未通过';

export function providerTestMessage(result: {
  status?: string;
  capabilityResults?: Record<string, { status?: string; errorCode?: string; attempted?: boolean }>;
}) {
  const entries = Object.entries(result.capabilityResults ?? {});
  const failed = entries.filter(([, item]) => item.status !== 'healthy' || item.attempted !== true);
  if (result.status === 'healthy' && entries.length && !failed.length)
    return { error: false, text: '当前输入的代表性能力检查通过。测试不会保存凭证。' };
  const details = failed
    .map(
      ([name, item]) =>
        `${marketCapabilityLabel(name)}：${providerProbeErrorLabel(item.errorCode)}`,
    )
    .join('；');
  return { error: true, text: details || '未能确认连接成功，请稍后重试。' };
}

export const credentialFieldLabels: Record<string, string> = {
  host: 'OpenD 主机地址',
  port: 'OpenD 端口',
  username: '用户名',
  password: '密码',
  clientId: '客户端 ID',
  token: 'Token',
  apiKey: 'API Key',
  appKey: 'App Key',
  appSecret: 'App Secret',
  accessToken: 'Access Token',
};

export function credentialSourceLabel(provider: ProviderManifest): string {
  if (!provider.requiresCredential) return '内置，无需凭证';
  if (provider.credentialSource === 'control') {
    return provider.configured ? '使用页面配置' : '页面凭证不可用，请重新配置';
  }
  if (provider.credentialSource === 'environment') return '使用 DSA 环境配置';
  if (
    !provider.credentialSource &&
    provider.configurationMode === 'dsa_environment' &&
    provider.configured
  )
    return '使用 DSA 环境配置';
  return '尚未配置凭证';
}

export function canRetainCredentialField(
  provider: ProviderManifest,
  method: string,
  name: string,
): boolean {
  return (
    provider.credentialSource === 'control' &&
    provider.credentialMethod === method &&
    provider.credentialFieldsConfigured?.[name] === true
  );
}

export function validateCredentialDraft(
  provider: ProviderManifest,
  draft: ProviderCredentialDraft,
): string | null {
  const schema = provider.credentialSchema?.methods.find((item) => item.method === draft.method);
  if (!schema) return '此数据源暂不支持该配置方式。';
  const missing = schema.fields.filter(
    (field) =>
      field.required &&
      !draft.values[field.name]?.trim() &&
      !canRetainCredentialField(provider, draft.method, field.name),
  );
  if (missing.length)
    return `请填写 ${missing.map((field) => credentialFieldLabels[field.name] ?? field.name).join('、')}。`;
  return null;
}

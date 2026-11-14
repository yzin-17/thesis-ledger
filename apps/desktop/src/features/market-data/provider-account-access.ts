import type { MarketAccountAccess, MarketProviderAccountAccessReport } from '@thesis-ledger/schemas';

export const accountAccessState = (access: MarketAccountAccess, now = Date.now(), configVersion?: number) => {
  if (access.state === 'allowed' && (!access.checkedAt || (!access.validUntil && !access.persisted) || access.configVersion === undefined)) return 'unknown';
  if (configVersion !== undefined && access.configVersion !== undefined && access.configVersion !== configVersion) return 'unknown';
  if (access.validUntil && Date.parse(access.validUntil) <= now) return 'unknown';
  return access.state;
};

export const accountAccessSelectable = (access: MarketAccountAccess | undefined, now = Date.now(), configVersion?: number) => {
  if (access === undefined) return true;
  const state = accountAccessState(access, now, configVersion);
  return state === 'allowed' || state === 'unknown';
};

export function accountAccessLabel(access: MarketAccountAccess, now = Date.now(), configVersion?: number): string {
  const state = accountAccessState(access, now, configVersion);
  if (state === 'allowed') return '当前账户可访问';
  if (state === 'not_included') return '当前等级未包含';
  if (state === 'permission_missing') return '当前账户缺少权限';
  if (state === 'credential_missing') return '尚未配置凭证';
  if (state === 'credential_invalid') return '凭证无效，请重新配置';
  if (access.validUntil && Date.parse(access.validUntil) <= now || access.errorCode === 'permission_check_expired')
    return '权限待验证 · 检查已过期';
  if (access.errorCode === 'rate_limited' || access.errorCode === 'rate_limited_global') {
    if (!access.attempted) return '权限待验证 · 限频后已暂停检查';
    return '权限待验证 · 请求频率受限';
  }
  if (access.errorCode === 'network_failure') return '权限待验证 · 网络请求未完成';
  if (access.errorCode === 'dependency_missing') return '权限待验证 · 运行环境缺少依赖';
  if (access.errorCode === 'credential_unavailable') return '权限待验证 · 凭证配置不可用';
  if (access.errorCode === 'upstream_failure') return '权限待验证 · 来源服务异常';
  if (access.errorCode === 'probe_busy') return '权限待验证 · 其他检查仍在执行';
  if (access.errorCode === 'invalid_response') return '权限待验证 · 来源响应异常';
  if (access.errorCode === 'request_budget_exceeded') return '权限待验证 · 检查预算已用完';
  return '未验证，可尝试使用';
}

export const accountAccessReportMessage = (report: MarketProviderAccountAccessReport) => {
  const count = (state: MarketAccountAccess['state']) => report.routes.filter((route) => route.access.state === state).length;
  if (count('not_included')) return { error: count('credential_invalid') > 0,
    text: `已确认${count('allowed')}项可用功能，${count('not_included')}项当前等级未包含，${count('unknown')}项待确认。` };
  const states = [
    ['allowed', '可访问'], ['permission_missing', '缺少权限'], ['credential_missing', '缺少凭证'],
    ['credential_invalid', '凭证无效'], ['unknown', '待验证'],
  ] as const;
  const details = states.filter(([state]) => count(state) > 0).map(([state, label]) => `${count(state)}项${label}`);
  return { error: count('credential_invalid') > 0,
    text: `功能权限已更新：${details.join('，')}。` };
};

export const nextAccountAccessRefresh = (validUntil: readonly (string | undefined)[], now = Date.now()) => {
  const times = validUntil.filter((value): value is string => !!value).map(Date.parse).filter((time) => Number.isFinite(time) && time > now);
  if (!times.length) return false;
  return Math.max(100, Math.min(...times) - now);
};

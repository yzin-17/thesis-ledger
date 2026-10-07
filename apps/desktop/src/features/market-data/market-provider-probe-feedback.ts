import type { MarketProviderTestResponse } from '@thesis-ledger/schemas';
import { marketCapabilityLabel } from './market-data-routes-v3.js';

export function marketProviderProbeFeedback(
  result: MarketProviderTestResponse,
  displayName: string,
) {
  const capabilities = Object.values(result.capabilityResults);
  const actuallyHealthy =
    capabilities.length > 0 &&
    capabilities.every(
      (capability) =>
        capability.status === 'healthy' && capability.attempted && !capability.errorCode,
    );
  if (result.status === 'healthy' && actuallyHealthy)
    return { type: 'success', text: `${displayName} 只读测试通过（未保存凭据）。` } as const;
  const details = Object.entries(result.capabilityResults)
    .filter(([, capability]) => capability.status !== 'healthy')
    .map(
      ([name, capability]) =>
        `${marketCapabilityLabel(name)}：${capability.status === 'unconfigured' ? '尚未配置凭据' : '来源暂不可用'}`,
    );
  let message = '部分能力不可用';
  if (result.status === 'unconfigured') message = '尚未配置凭据';
  else if (result.status === 'healthy') message = '尚无已执行的真实能力测试结果';
  return { type: 'error', text: details.join('；') || message } as const;
}

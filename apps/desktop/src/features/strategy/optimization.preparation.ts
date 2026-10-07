import {
  optimizationRunPreparationRequestSchema,
  optimizationRunPreparationResultSchema,
  type OptimizationPreparationTarget,
  type OptimizationRunPreparationRequest,
  type OptimizationRunPreparationResult,
  type OptimizationDiscoveryScope,
} from '@thesis-ledger/schemas';
import { requestDesktopJson, type DesktopRequestClient } from '../shared/request.js';

export type PreparedOptimizationConfiguration = {
  target: OptimizationPreparationTarget;
  result: Extract<OptimizationRunPreparationResult, { status: 'prepared' }>;
};
export function experimentPreparationTarget(
  sourceMode: 'existing' | 'discovery',
  strategyVersionId: string,
  discoveryScope: OptimizationDiscoveryScope,
): OptimizationPreparationTarget {
  return sourceMode === 'existing'
    ? { sourceMode, strategyVersionId }
    : { sourceMode, discoveryScope };
}
export async function prepareOptimizationConfiguration(
  input: OptimizationRunPreparationRequest,
  signal?: AbortSignal,
  client?: DesktopRequestClient,
) {
  const request = optimizationRunPreparationRequestSchema.parse(input);
  const response = await requestDesktopJson<unknown>(
    '/strategy-optimization/run-config/prepare',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      ...(signal ? { signal } : {}),
    },
    client,
  );
  const result = optimizationRunPreparationResultSchema.parse(response);
  if (result.requestId !== request.intent.requestId)
    throw new Error('实验配置准备响应与当前请求不一致');
  return result;
}

export function requirePreparedOptimizationConfiguration(
  prepared: PreparedOptimizationConfiguration | null,
  target: OptimizationPreparationTarget,
  startDate: string,
  endDate: string,
  currency: string,
  initialCash: string,
) {
  if (!prepared || JSON.stringify(prepared.target) !== JSON.stringify(target))
    throw new Error('请先准备当前实验的价格与执行模型配置');
  const config = prepared.result.runConfig;
  if (
    config.startDate !== startDate ||
    config.endDate !== endDate ||
    config.baseCurrency !== currency ||
    Number(config.initialCash[config.baseCurrency]) !== Number(initialCash)
  )
    throw new Error('区间或资金已改变，请重新准备实验配置');
  return config;
}

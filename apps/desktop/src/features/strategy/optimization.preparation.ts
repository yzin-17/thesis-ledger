import {
  type OptimizationPreparationTarget,
  type OptimizationRunPreparationRequest,
  type OptimizationRunPreparationResult,
  type OptimizationDiscoveryScope,
} from '@thesis-ledger/schemas';
import { strategyClients } from '@thesis-ledger/api-client';
import { parsedDesktopRequest, type DesktopRequestClient } from '../shared/request.js';

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
  return strategyClients(parsedDesktopRequest(client)).optimization.prepare(input, signal);
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

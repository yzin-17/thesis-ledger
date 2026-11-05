import type { ParsedRequest } from './parsed-request.js';
import { strategyDefinitionClient } from './strategy-definition-client.js';
import { strategyAuthoringClient } from './strategy-authoring-client.js';
import { strategyOptimizationClient } from './strategy-optimization-client.js';
import { strategyRiskClient } from './strategy-risk-client.js';

/** 策略工作区按领域客户端组合，传输与 Schema 校验由调用方提供。 */
export function strategyClients(request: ParsedRequest) {
  return {
    definitions: strategyDefinitionClient(request),
    authoring: strategyAuthoringClient(request),
    optimization: strategyOptimizationClient(request),
    risk: strategyRiskClient(request),
  };
}

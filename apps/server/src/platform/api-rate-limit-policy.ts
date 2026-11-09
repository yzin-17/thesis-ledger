import { commandRoutes } from './api-rate-limit-command-routes.js';
import { queryRoutes } from './api-rate-limit-query-routes.js';

export type ApiCostClass =
  | 'read' | 'poll' | 'marketRead' | 'preview' | 'write' | 'task'
  | 'ai' | 'integration' | 'auth' | 'export' | 'monitor';

export const apiCostBudgets = {
  read: { operation: 600, total: 3000 },
  poll: { operation: 600, total: 3000 },
  marketRead: { operation: 600, total: 1800 },
  preview: { operation: 120, total: 600 },
  write: { operation: 120, total: 600 },
  task: { operation: 20, total: 40 },
  ai: { operation: 10, total: 20 },
  integration: { operation: 10, total: 30 },
  auth: { operation: 10, total: 20 },
  export: { operation: 10, total: 20 },
  monitor: { operation: 120, total: 600 },
} satisfies Record<ApiCostClass, { operation: number; total: number }>;

export interface ApiRateLimitPolicy { operation: string; cost: ApiCostClass }

export const apiRateLimitPolicies: readonly ApiRateLimitPolicy[] = Object.entries({
  ...queryRoutes,
  ...commandRoutes,
}).flatMap(([cost, operations]) => operations.map((operation) => ({
  operation,
  cost: cost as ApiCostClass,
})));

function routeMatcher(operation: string) {
  const [method, path] = operation.split(' ') as [string, string];
  const segments = path.split('/');
  const specificity = segments.filter((segment) => !segment.startsWith(':')).length;
  const pattern = segments.map((segment) => {
    if (segment.startsWith(':')) return '[^/]+';
    return segment.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  }).join('/');
  return { method, specificity, matches: new RegExp(`^${pattern}/?$`, 'iu') };
}

const compiledPolicies = apiRateLimitPolicies
  .map((policy) => ({ ...policy, ...routeMatcher(policy.operation) }))
  .sort((a, b) => b.specificity - a.specificity);

export function apiRateLimitPolicy(method: string, path: string): ApiRateLimitPolicy | undefined {
  const verb = method.toUpperCase() === 'HEAD' ? 'GET' : method.toUpperCase();
  const pathname = path.split('?')[0] ?? path;
  return compiledPolicies.find((policy) => policy.method === verb && policy.matches.test(pathname));
}

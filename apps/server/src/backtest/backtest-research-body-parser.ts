import type { IncomingMessage } from 'node:http';

const paths = new Set([
  '/api/v1/backtests/run-config/prepare',
  '/api/v1/backtests/run-config/preflight',
  '/api/v1/backtests/runs',
]);

/** 冻结研究原文随配置交换；只扩大这三个入口，仍在认证和限流之后解析。 */
export function backtestResearchBodyParserOptions() {
  return {
    limit: '8mb',
    type: (request: IncomingMessage) =>
      request.method === 'POST' &&
      paths.has((request.url ?? '').split('?')[0]!) &&
      request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() === 'application/json',
  };
}

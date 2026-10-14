import { randomUUID } from 'node:crypto';
import { StructuredLogger, currentTraceId } from '../../platform/structured-logger.js';

const logger = new StructuredLogger('DsaCacheRequest');
const dataPaths = new Set([
  '/api/v3/thesis-ledger/market/fund-nav',
  '/api/v3/thesis-ledger/market/fund-nav/history',
  '/api/v3/thesis-ledger/market/fund-holdings',
  '/api/v3/thesis-ledger/market/chip',
]);

/** 只观察原缓存传输尝试；不读取载荷或更改fetch/重试语义。 */
export async function fetchObservedCacheRequest(
  url: URL, options: RequestInit, traceId: string, attempt: number,
): Promise<Response> {
  const method = options.method ?? 'GET';
  let category: 'data' | 'control' | undefined;
  if (method === 'GET' && dataPaths.has(url.pathname)) category = 'data';
  if (method === 'POST' && url.pathname === '/api/v3/thesis-ledger/market/cache-context') category = 'control';
  // 原消费trace才有完整调用证据；独立CLI继续保留原stdout协议。
  if (!category || !currentTraceId()) return fetch(url, options);
  let transportId: string;
  try { transportId = randomUUID(); }
  catch { return fetch(url, options); }
  const record = { operation: 'dsa.cache-request', traceId, transportId,
    category, method, path: url.pathname, attempt };
  const emit = (stage: 'started' | 'settled', outcome?: 'response' | 'error') => {
    try { logger.log({ ...record, stage, ...(outcome ? { outcome } : {}) }); }
    catch { /* 观察故障不进入原HTTP重试或错误分类。 */ }
  };
  emit('started');
  try {
    const response = await fetch(url, options);
    emit('settled', 'response');
    return response;
  } catch (error) {
    emit('settled', 'error');
    throw error;
  }
}

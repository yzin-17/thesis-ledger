import {
  aiProviderModelCatalogConfigSchema,
  aiProviderModelCatalogOriginAllowed,
  type AiAuthMode,
  type AiProviderModelCatalogConfig,
  type AiUpstreamFormat,
} from '@thesis-ledger/schemas';
import { asRecord } from './ai-provider.contracts.js';
import { aiPolicyFetch } from './timeout/ai-policy-fetch.js';

const MAX_MODEL_COUNT = 2_000;
const MAX_PAGES = 21;

// JSON Pointer 读取只访问响应自身字段，不能沿原型链解析路径。
export const catalogPointerValue = (value: unknown, pointer: string): unknown => {
  if (pointer === '') return value;
  let current = value;
  for (const segment of pointer.slice(1).split('/')) {
    const key = segment.replace(/~1/gu, '/').replace(/~0/gu, '~');
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, key)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
};

const requestHeaders = (credential: string, format: AiUpstreamFormat, authMode: AiAuthMode) => {
  if (format === 'anthropic-messages')
    return {
      ...(authMode === 'api_key' && credential ? { 'x-api-key': credential } : {}),
      'anthropic-version': '2023-06-01',
    };
  return authMode === 'api_key' && credential ? { authorization: `Bearer ${credential}` } : {};
};

const readCatalogPage = async (
  url: URL,
  headers: HeadersInit,
  signal: AbortSignal,
  config: AiProviderModelCatalogConfig | null,
): Promise<unknown[]> => {
  const response = await aiPolicyFetch(url.toString(), {
    method: 'GET',
    headers,
    redirect: 'error',
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  const error = asRecord(asRecord(payload)?.error)?.message;
  if (!response.ok || typeof error === 'string')
    throw new Error(
      typeof error === 'string' ? error : `Provider 模型接口返回 HTTP ${response.status}`,
    );
  const items = catalogPointerValue(payload, config?.itemsPath ?? '/data');
  if (!Array.isArray(items))
    throw new Error(
      config ? 'Provider 模型目录的列表路径没有返回数组' : 'Provider 模型接口响应缺少 data 数组',
    );
  const rows: unknown[] = items;
  return rows;
};

export const readModelCatalogItems = async (
  baseUrl: string,
  credential: string,
  signal: AbortSignal,
  format: AiUpstreamFormat,
  authMode: AiAuthMode,
  suppliedConfig?: AiProviderModelCatalogConfig | null,
): Promise<unknown[]> => {
  const config = suppliedConfig ? aiProviderModelCatalogConfigSchema.parse(suppliedConfig) : null;
  if (!aiProviderModelCatalogOriginAllowed(baseUrl, config, authMode))
    throw new Error('使用 API Key 的目录地址必须与生成地址同源');
  const endpoint = new URL(config?.url ?? `${baseUrl.replace(/\/+$/u, '')}/models`);
  const headers = requestHeaders(credential, format, authMode);
  const pagination = config?.pagination;
  const rows: unknown[] = [];
  const seenPages = new Set<string>();
  let received = 0;
  const pageLimit = pagination ? MAX_PAGES : 1;
  for (let index = 0; index < pageLimit; index += 1) {
    const url = new URL(endpoint);
    if (pagination) {
      url.searchParams.set(pagination.pageParam, String(pagination.startPage + index));
      if (pagination.pageSizeParam)
        url.searchParams.set(pagination.pageSizeParam, String(pagination.pageSize));
    }
    const items = await readCatalogPage(url, headers, signal, config);
    received += items.length;
    if (received > MAX_MODEL_COUNT)
      throw new Error(`Provider 模型目录超过 ${MAX_MODEL_COUNT} 条上限`);
    if (items.length === 0) return rows;
    const identity = JSON.stringify(
      items.map((item) => catalogPointerValue(item, config?.idPath ?? '/id')),
    );
    if (seenPages.has(identity)) throw new Error('Provider 模型目录分页未前进');
    seenPages.add(identity);
    const filter = config?.filter;
    rows.push(
      ...items.filter(
        (item) => !filter || catalogPointerValue(item, filter.path) === filter.equals,
      ),
    );
    if (!pagination || (pagination.stopWhen === 'short-page' && items.length < pagination.pageSize))
      return rows;
  }
  throw new Error(`Provider 模型目录超过 ${MAX_PAGES} 页上限`);
};

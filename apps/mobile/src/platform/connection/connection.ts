export const connectionStorageKey = 'thesis-ledger-mobile-connection-v1';

export function normalizeConnection(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('请输入完整的 http 或 https 服务地址。');
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname)
    throw new Error('服务地址仅支持 http 或 https。');
  if (url.username || url.password || url.search || url.hash)
    throw new Error('服务地址不能包含账号、密码、查询参数或片段。');
  const pathname = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${pathname || '/api/v1'}`;
}

export type PreferenceStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export function connectionPersistence(storage: PreferenceStorage) {
  let revision = 0;
  let queue = Promise.resolve();
  return {
    async restore(): Promise<string | null> {
      const current = revision;
      const value = await storage.getItem(connectionStorageKey);
      if (current !== revision || value === null) return null;
      return normalizeConnection(value);
    },
    save(value: string) {
      const normalized = normalizeConnection(value);
      revision += 1;
      const next = queue.then(() => storage.setItem(connectionStorageKey, normalized));
      queue = next.catch(() => undefined);
      return next;
    },
  };
}

export async function checkConnection(baseUrl: string, fetcher: typeof fetch = fetch) {
  const normalized = normalizeConnection(baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetcher(`${normalized}/health`, { signal: controller.signal });
    if (!response.ok) throw new Error(`服务连接失败（HTTP ${response.status}）。`);
    const body: unknown = await response.json();
    if (
      !body ||
      typeof body !== 'object' ||
      !('status' in body) ||
      body.status !== 'healthy' ||
      !('service' in body) ||
      body.service !== 'thesis-ledger'
    )
      throw new Error('该地址没有返回 ThesisLedger 健康状态，请检查 API 地址。');
    return normalized;
  } finally {
    clearTimeout(timer);
  }
}

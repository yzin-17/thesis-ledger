import {
  currentProviderOAuthSessionSchema,
  providerOAuthSessionSchema,
} from '@thesis-ledger/schemas';
import type { ParsedRequest } from './parsed-request.js';
export function safeProviderOAuthUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      ![
        'openapi.longbridge.com',
        'openapi.longbridge.cn',
        'openapi-global.longbridge.xyz',
      ].includes(url.hostname) ||
      url.pathname !== '/oauth2/authorize' ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443')
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
const session = providerOAuthSessionSchema.refine(
  (row) => row.authorizationUrl === null || safeProviderOAuthUrl(row.authorizationUrl) !== null,
);
export function providerOAuthClient(request: ParsedRequest) {
  const base = '/api/market-data/providers/longbridge/oauth/sessions';
  return {
    create: (clientId: string) => {
      if (!clientId.trim()) throw new Error('请填写客户端 ID');
      return request(base, session, { method: 'POST', body: JSON.stringify({ clientId }) });
    },
    current: (signal?: AbortSignal) =>
      request(
        `${base}/current`,
        currentProviderOAuthSessionSchema.refine(
          (row) => !row.session || session.safeParse(row.session).success,
        ),
        { signal: signal ?? null, cache: 'no-store' },
      ),
    get: (id: string, signal?: AbortSignal) => {
      providerOAuthSessionSchema.shape.sessionId.parse(id);
      return request(
        `${base}/${encodeURIComponent(id)}`,
        session.refine((row) => row.sessionId === id),
        { signal: signal ?? null, cache: 'no-store' },
      );
    },
    cancel: (id: string) => {
      providerOAuthSessionSchema.shape.sessionId.parse(id);
      return request(
        `${base}/${encodeURIComponent(id)}/cancel`,
        session.refine((row) => row.sessionId === id),
        { method: 'POST' },
      );
    },
  };
}

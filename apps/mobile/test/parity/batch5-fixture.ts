export const b5Revision = '2026-10-25T01:00:00.000Z';
export const b5Id = '7b355ed2-bcb7-4234-af08-10441ab20e34';
export const b5Ai = {
  name: 'B5-fixture',
  type: 'ai',
  enabled: false,
  priority: 100,
  capabilities: ['chat'],
  health: 'unknown',
  credentialConfigured: true,
  baseUrl: 'https://fixture.test/v1',
  models: ['fixture'],
  authMode: 'api_key',
  upstreamFormat: 'chat-completions',
  updatedAt: b5Revision,
  executionRoutes: [],
};
export const b5Plan = (pending = false) => ({
  planFingerprint: 'a'.repeat(64),
  pending: pending ? [{ model: 'fixture', purpose: 'research', policy: 'auto' }] : [],
  maxCalls: pending ? 2 : 0,
  maxOutputTokensPerCall: 512,
  maxDurationSeconds: 60,
  estimatedCosts: [],
});
export const b5Provider = {
  providerId: 'longbridge',
  displayName: 'B5 受控来源',
  version: 1,
  capabilities: { quote: ['CN'] },
  configured: true,
  enabled: false,
  credentialConfigured: true,
  accountAccessSupported: true,
  configurationMode: 'control',
  credentialMethod: 'token',
  configVersion: 1,
  settings: {},
  credentialSchema: {
    methods: [{ method: 'token', fields: [{ name: 'token', secret: true, required: true }] }],
  },
};
export const b5Job = {
  id: b5Id,
  name: 'B5 自建任务',
  type: 'provider-health',
  cron: '0 9 * * 1-5',
  timezone: 'Asia/Shanghai',
  enabled: false,
  nextRunAt: null,
  managed: false,
};
export const b5Policy = {
  contractVersion: 3,
  consumer: 'thesis-ledger',
  requestId: 'fixture',
  revision: 2,
  enabled: false,
  routes: [],
  syncState: 'pending',
  effectiveProjection: null,
  effectiveStale: true,
};
export const b5Catalog = {
  generation: 0,
  checksum: null,
  cursor: null,
  syncedAt: null,
  instrumentCount: 0,
  readinessState: 'unavailable',
  refreshInProgress: false,
  activeJobId: null,
  lastAttemptAt: null,
  lastError: '受控目录尚未同步',
  retryAt: null,
};
export const b5Session = {
  sessionId: b5Id,
  providerId: 'longbridge',
  status: 'authorizing',
  authorizationUrl: 'https://openapi.longbridge.com/oauth2/authorize?client_id=fixture',
  expiresAt: '2099-10-25T02:00:00.000Z',
  errorCode: null,
};

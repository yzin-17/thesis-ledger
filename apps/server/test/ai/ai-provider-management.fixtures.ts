import { vi } from 'vitest';
import {
  encryptProviderCredential,
  decryptProviderCredential,
} from '../../src/platform/credential-security.js';
import { DEFAULT_SLOW_AFTER_MS } from '../../src/providers/provider-health.service.js';

export type TestRow = {
  name: string;
  type: string;
  enabled: boolean;
  priority: number;
  capabilities: string[];
  settings: Record<string, unknown>;
  encryptedCredentials?: Uint8Array;
  health: string;
  updatedAt: Date;
};
export type SaveInput = {
  name: string;
  enabled?: boolean;
  priority: number;
  capabilities: string[];
  credentialsRef?: string;
  settings: Record<string, unknown>;
  clearCredentials?: boolean;
};

export const validSettings = (baseUrl = 'https://db.example/v1', models = ['db-model']) => ({
  baseUrl,
  models,
  upstreamFormat: 'chat-completions',
  chatImplementation: 'compatible',
});

export const createConfigStub = (initial: TestRow[] = []) => {
  let rows = [...initial];
  const service = {
    listStored: vi.fn(async () => rows),
    findStored: vi.fn(async (name: string) => rows.find((row) => row.name === name)),
    readCredential: vi.fn(async (config: { encryptedCredentials?: Uint8Array }) =>
      config.encryptedCredentials
        ? decryptProviderCredential(config.encryptedCredentials).credential
        : '',
    ),
    setEnabled: vi.fn(async (name: string, enabled: boolean) => {
      const row = rows.find((item) => item.name === name);
      if (!row) throw new Error('missing row');
      row.enabled = enabled;
      row.updatedAt = new Date();
      return row;
    }),
    setHealth: vi.fn(async (name: string, health: string) => {
      const row = rows.find((item) => item.name === name);
      if (!row) throw new Error('missing row');
      row.health = health;
      return row;
    }),
    deleteStored: vi.fn(async (name: string) => {
      rows = rows.filter((row) => row.name !== name);
    }),
    saveAi: vi.fn(async (input: SaveInput) => {
      const existing = rows.find((row) => row.name === input.name);
      const saved: TestRow = {
        name: input.name,
        type: 'ai',
        enabled: input.enabled ?? existing?.enabled ?? true,
        priority: input.priority,
        capabilities: input.capabilities,
        settings: input.settings,
        ...(!input.clearCredentials && existing?.encryptedCredentials
          ? { encryptedCredentials: existing.encryptedCredentials }
          : {}),
        health: existing?.health ?? 'unknown',
        updatedAt: new Date(),
      };
      rows = [...rows.filter((row) => row.name !== input.name), saved];
      return saved;
    }),
  };
  return {
    service,
    replace(next: TestRow[]) {
      rows = next;
    },
  };
};

export const createHealthStub = () => ({
  record: vi.fn(
    async (
      provider: string,
      success: boolean,
      latencyMs: number,
      _error: string | undefined,
      checkedAt: Date,
      _source?: string,
      _details?: unknown,
      // 忠实复刻 ProviderHealthService.record 的规则：成功但超过阈值算 degraded。
      // 用固定 healthy 的桩会盖住「慢生成被误判成 degraded」这类问题。
      slowAfterMs = DEFAULT_SLOW_AFTER_MS,
    ) => ({
      provider,
      state: success ? (latencyMs > slowAfterMs ? 'degraded' : 'healthy') : 'degraded',
      latencyMs,
      checkedAt,
    }),
  ),
  recordHistory: vi.fn(
    async (
      provider: string,
      state: string,
      latencyMs: number,
      errorCode: string | undefined,
      checkedAt: Date,
      source: string,
      details: unknown,
    ) => {
      void provider;
      void state;
      void latencyMs;
      void errorCode;
      void checkedAt;
      void source;
      void details;
      return null;
    },
  ),
  get: vi.fn(async () => null),
});

export const createDbRow = (name: string, overrides: Partial<TestRow> = {}): TestRow => ({
  name,
  type: 'ai',
  enabled: true,
  priority: 1,
  capabilities: ['chat'],
  settings: validSettings(),
  encryptedCredentials: encryptProviderCredential(`db-key-${name}`),
  health: 'unknown',
  updatedAt: new Date('2026-09-14T00:00:00.000Z'),
  ...overrides,
});

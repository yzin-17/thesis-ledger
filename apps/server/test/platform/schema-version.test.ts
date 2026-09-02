import { readFile } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthService } from '../../src/platform/health.service.js';
import { PrismaService } from '../../src/platform/prisma.service.js';
import {
  assertDatabaseSchemaVersion,
  CURRENT_SCHEMA_VERSION,
  isCurrentDatabaseSchemaVersion,
  parseDatabaseSchemaVersion,
  readDatabaseSchemaVersion,
} from '../../src/platform/schema-version.js';

const queryResult = (version: string) => [{ version }];

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://placeholder:placeholder@localhost:5432/placeholder';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.DSA_BASE_URL = 'http://localhost:8000';
  process.env.THESIS_LEDGER_DSA_TOKEN = 'test-dsa-token';
  process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
});

describe('current database schema version', () => {
  it('只接受唯一版本标记并对缺失行返回 null', async () => {
    await expect(
      readDatabaseSchemaVersion(async () => queryResult(CURRENT_SCHEMA_VERSION)),
    ).resolves.toBe(CURRENT_SCHEMA_VERSION);
    await expect(readDatabaseSchemaVersion(async () => [])).resolves.toBeNull();
    expect(parseDatabaseSchemaVersion({})).toBeNull();
    expect(isCurrentDatabaseSchemaVersion(CURRENT_SCHEMA_VERSION)).toBe(true);
    expect(isCurrentDatabaseSchemaVersion('20260818000000_market_data_provider_v12')).toBe(false);
  });

  it('版本不匹配时 fail-fast', async () => {
    await expect(
      assertDatabaseSchemaVersion(async () => queryResult('stale-schema')),
    ).rejects.toThrow(`expected ${CURRENT_SCHEMA_VERSION}, got stale-schema`);
  });
});

describe('PrismaService schema guard', () => {
  const createService = (version: string) => {
    const service = Object.create(PrismaService.prototype) as PrismaService;
    const connect = vi.fn(async () => undefined);
    const disconnect = vi.fn(async () => undefined);
    const queryRaw = vi.fn(async () => queryResult(version));
    Object.assign(service, { $connect: connect, $disconnect: disconnect, $queryRaw: queryRaw });
    return { service, connect, disconnect, queryRaw };
  };

  it('连接后验证 marker，销毁时断开 Prisma', async () => {
    const { service, connect, disconnect, queryRaw } = createService(CURRENT_SCHEMA_VERSION);

    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(connect).toHaveBeenCalledOnce();
    expect(queryRaw).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('旧版本连接失败并主动断开', async () => {
    const { service, disconnect } = createService('stale-schema');

    await expect(service.onModuleInit()).rejects.toThrow('Database schema version mismatch');
    expect(disconnect).toHaveBeenCalledOnce();
  });
});

describe('HealthService schema reporting', () => {
  const createService = (version: string) =>
    new HealthService(
      { $queryRaw: vi.fn(async () => queryResult(version)) } as never,
      { ping: vi.fn(async () => 'PONG') } as never,
      {
        health: vi.fn(async () => ({ ok: true })),
        capabilities: vi.fn(async () => ({ capabilities: { 'fund-nav': true } })),
      } as never,
    );

  it('健康响应复用 current marker，版本不匹配时数据库为 down', async () => {
    const result = await createService('stale-schema').check();

    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.dependencies.database).toBe('down');
    expect(result.status).toBe('degraded');
  });

  it('current marker 与依赖均正常时报告 healthy', async () => {
    const result = await createService(CURRENT_SCHEMA_VERSION).check();

    expect(result.dependencies.database).toBe('healthy');
    expect(result.status).toBe('healthy');
  });
});

it('Nest bootstrap 启用 shutdown hooks', async () => {
  const source = await readFile(new URL('../../src/main.ts', import.meta.url), 'utf8');
  expect(source).toContain('app.enableShutdownHooks();');
});

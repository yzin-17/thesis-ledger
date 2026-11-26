import { namedStrategyFixture } from './named-v1-strategy.fixture.js';
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { StrategyCreationService } from '../../src/backtest/strategy-creation.service.js';
import { publishManualStrategyVersion } from '../../src/backtest/strategy-version-publication.js';
import { requireNewStrategyDefinition } from '../../src/backtest/strategy-definition-write.js';
import { hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';

const fixture = () =>
  JSON.parse(
    readFileSync(
      new URL(
        '../../../../packages/schemas/fixtures/strategy-authoring.exchange.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
it('旧客户端写入在事务与持久化前稳定拒绝，历史仍可计算原摘要', async () => {
  const definition = { ...fixture(), schemaVersion: '3', entryTrigger: 'rising-edge' };
  const originalFingerprint = hashCanonicalManifest(definition);
  const prisma = { $transaction: vi.fn(), strategy: { create: vi.fn() } };
  expect(() => requireNewStrategyDefinition(definition)).toThrow('strategy-definition-v1');
  expect(() =>
    new StrategyCreationService().createInTransaction(prisma as never, {
      name: definition.name,
      ownerId: null,
      definition,
      source: { kind: 'manual' },
    }),
  ).toThrow();
  await expect(
    publishManualStrategyVersion(prisma as never, 'strategy', definition),
  ).rejects.toThrow();
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(prisma.strategy.create).not.toHaveBeenCalled();
  expect(namedStrategyFixture(definition).schemaVersion).toBe('strategy-definition-v1');
  expect(hashCanonicalManifest(definition)).toBe(originalFingerprint);
});
it('新建与版本发布原样保存已审核来源、坐标及规则', async () => {
  const definition = { ...namedStrategyFixture(fixture()), entryTrigger: 'rising-edge' as const };
  definition.signalSources.push({ ...definition.signalSources[0]!, id: 'unused' });
  const create = vi.fn(async (input: unknown) => input);
  const tx = {
    $executeRaw: vi.fn(),
    strategy: { create, findUnique: vi.fn(async () => ({ schemaVersion: 1 })) },
    strategyVersion: { aggregate: vi.fn(async () => ({ _max: { version: 2 } })), create },
  };
  const prisma = { $transaction: async (callback: (tx: unknown) => unknown) => callback(tx) };
  await new StrategyCreationService().createInTransaction(tx as never, {
    name: definition.name,
    ownerId: null,
    definition,
    source: { kind: 'manual' },
  });
  expect(create).toHaveBeenLastCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        schemaVersion: 1,
        versions: { create: expect.objectContaining({ schema: definition }) },
      }),
    }),
  );
  await publishManualStrategyVersion(prisma as never, 'strategy', definition);
  expect(create).toHaveBeenLastCalledWith({
    data: {
      strategyId: 'strategy',
      version: 3,
      schemaVersion: 1,
      schema: definition,
      source: { kind: 'manual' },
    },
  });
});

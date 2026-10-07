import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { BacktestService } from '../../src/backtest/backtest.service.js';
import { testResultReadPolicy } from './test-result-read-policy.js';

const strategy = JSON.parse(
  readFileSync(
    new URL('../../../../packages/schemas/fixtures/backtest-v2.exchange.json', import.meta.url),
    'utf8',
  ),
);

const serviceWith = (prisma: object) =>
  new BacktestService(prisma as never, undefined, undefined, testResultReadPolicy());

describe('现行策略创建', () => {
  it('创建版本时保留已有版本并写入现行策略合同', async () => {
    const create = vi.fn(async ({ data }: { data: object }) => data);
    const createVersion = vi.fn(async ({ data }: { data: object }) => data);
    const service = serviceWith({
      strategy: { create, findUnique: vi.fn(async () => ({ schemaVersion: 2 })) },
      strategyVersion: {
        aggregate: vi.fn(async () => ({ _max: { version: 1 } })),
        create: createVersion,
      },
    });

    await service.createStrategy('测试策略', strategy);
    await service.createVersion('11111111-1111-4111-8111-111111111116', strategy);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ schemaVersion: 2, status: 'draft' }) }),
    );
    expect(createVersion).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ version: 2, schemaVersion: 2 }) }),
    );
  });

  it('旧策略输入在数据库写入前拒绝', async () => {
    const create = vi.fn();
    const service = serviceWith({ strategy: { create } });
    await expect(service.createStrategy('旧策略', { version: 1 })).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });

  it('旧策略不能附加现行版本，列表只查询现行策略与版本', async () => {
    const createVersion = vi.fn();
    const findMany = vi.fn(async () => []);
    const service = serviceWith({
      strategy: {
        findUnique: vi.fn(async () => ({ schemaVersion: 1 })),
        findMany,
      },
      strategyVersion: { aggregate: vi.fn(), create: createVersion },
    });
    await expect(service.createVersion('old-strategy', strategy)).rejects.toMatchObject({
      response: { code: 'UNSUPPORTED_CONTRACT_VERSION' },
    });
    expect(createVersion).not.toHaveBeenCalled();
    await service.listStrategies();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ schemaVersion: 2 }),
        include: { versions: { where: { schemaVersion: 2 } } },
      }),
    );
  });
});

import { describe, expect, it, vi } from 'vitest';
import { AiRoutingSettingsService } from '../../src/ai/ai-routing-settings.service.js';
import { aiRoutingSettingsUpdateSchema } from '../../src/ai/ai-routing-settings.contracts.js';

type Row = {
  id: string;
  researchDefaultProvider: string | null;
  researchDefaultModel: string | null;
  revision: number;
};

const createPrisma = (initial?: Row) => {
  let row = initial;
  const prisma = {
    aiRoutingSettings: {
      findUnique: vi.fn(async () => row ?? null),
      create: vi.fn(async ({ data }: { data: Omit<Row, 'revision'> & { revision: number } }) => {
        if (row) throw { code: 'P2002' };
        row = { ...data };
        return row;
      }),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; revision: number };
          data: Partial<Row>;
        }) => {
          if (!row || row.id !== where.id || row.revision !== where.revision) return { count: 0 };
          row = { ...row, ...data };
          return { count: 1 };
        },
      ),
    },
  };
  return { prisma, getRow: () => row };
};

describe('AI 研究默认设置', () => {
  it('更新契约必须携带当前修订号', () => {
    expect(() =>
      aiRoutingSettingsUpdateSchema.parse({
        researchDefault: null,
      }),
    ).toThrow();
  });

  it('空设置可创建、读取并递增版本', async () => {
    const state = createPrisma();
    const service = new AiRoutingSettingsService(state.prisma as never);

    await expect(service.read()).resolves.toEqual({ researchDefault: null, revision: '0' });
    await expect(
      service.update({
        researchDefault: { providerId: 'lmstudio', model: 'local-model' },
        expectedRevision: '0',
      }),
    ).resolves.toEqual({
      researchDefault: { providerId: 'lmstudio', model: 'local-model' },
      revision: '1',
    });
    await expect(service.update({ researchDefault: null, expectedRevision: '1' })).resolves.toEqual(
      { researchDefault: null, revision: '2' },
    );
    expect(state.getRow()?.researchDefaultProvider).toBeNull();
  });

  it('拒绝过期版本，避免后写覆盖前写', async () => {
    const state = createPrisma({
      id: 'global',
      researchDefaultProvider: 'provider-a',
      researchDefaultModel: 'model-a',
      revision: 3,
    });
    const service = new AiRoutingSettingsService(state.prisma as never);

    await expect(
      service.update({
        researchDefault: { providerId: 'provider-b', model: 'model-b' },
        expectedRevision: '2',
      }),
    ).rejects.toThrow('已变化');
    expect(state.getRow()).toMatchObject({
      researchDefaultProvider: 'provider-a',
      researchDefaultModel: 'model-a',
      revision: 3,
    });
  });
});

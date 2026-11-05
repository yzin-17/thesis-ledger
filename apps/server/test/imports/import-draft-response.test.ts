import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { importDraftSchema } from '@thesis-ledger/schemas';
import { ImportController } from '../../src/imports/import.controller.js';
import { importDraftResponse } from '../../src/imports/import-draft-response.js';

const stored = {
  id: '00000000-0000-4000-8000-000000000001',
  accountId: '00000000-0000-4000-8000-000000000002',
  source: 'broker',
  sourceConfidence: new Prisma.Decimal('0.875'),
  status: 'pending',
  scope: 'FULL',
  idempotencyKey: 'native-screenshot-idempotency-key',
  rows: [],
  baselineHash: null,
  createdAt: new Date('2026-10-22T17:45:00Z'),
};

describe('截图上传响应契约', () => {
  it('新建与幂等命中都返回 wire 数字，空基线不变成非法 null', async () => {
    const createDraft = vi.fn().mockResolvedValue(stored);
    const controller = new ImportController({ createDraft } as never);
    const file = {
      mimetype: 'image/png',
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    };
    for (let index = 0; index < 2; index += 1) {
      const result = await controller.upload(file as never, {
        accountId: stored.accountId,
        source: 'broker',
        extracted: '[]',
      });
      expect(importDraftSchema.parse(JSON.parse(JSON.stringify(result)))).toMatchObject({
        id: stored.id,
        sourceConfidence: 0.875,
        rows: [],
      });
      expect(result.baselineHash).toBeUndefined();
    }
    expect(createDraft).toHaveBeenCalledTimes(2);
  });
  it('非法持久化置信度仍被响应契约拒绝', () => {
    expect(() =>
      importDraftResponse({ ...stored, sourceConfidence: new Prisma.Decimal('1.1') } as never),
    ).toThrow();
  });
});

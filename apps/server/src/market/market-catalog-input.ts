import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

const input = z.strictObject({
  contractVersion: z.literal(3).optional(),
  consumer: z.literal('thesis-ledger').optional(),
  requestId: z.string().trim().min(1).optional(),
  scope: z.enum(['CN', 'HK_US']).optional(),
});

export function assertCatalogSyncInput(raw?: unknown) {
  const parsed = input.safeParse(raw ?? {});
  if (!parsed.success) throw new BadRequestException('目录同步请求不符合当前合同');
  return parsed.data;
}

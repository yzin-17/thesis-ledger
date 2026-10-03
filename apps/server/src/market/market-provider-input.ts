import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

const envelope = {
  contractVersion: z.literal(3).optional(),
  consumer: z.literal('thesis-ledger').optional(),
  requestId: z.string().trim().min(1).optional(),
};
const credentials = z.strictObject({
  method: z.string().min(1),
  values: z.record(z.string(), z.unknown()),
});
const save = z
  .strictObject({
    ...envelope,
    enabled: z.boolean().optional(),
    credentials: credentials.optional(),
    clearCredentials: z.boolean().optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((value) => !(value.clearCredentials && value.credentials));
const test = z.strictObject({ ...envelope, credentials: credentials.optional() });
const remove = z.strictObject(envelope);

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const raw = input ?? {};
  if (typeof raw === 'object' && raw !== null && 'credential' in raw) {
    throw new BadRequestException('请使用 credentials 提交 Provider 凭证');
  }
  const result = schema.safeParse(raw);
  if (!result.success) throw new BadRequestException('Provider 请求不符合当前合同');
  return result.data;
}

export const parseProviderSaveInput = (input: unknown) => parse(save, input);
export const parseProviderTestInput = (input: unknown) => parse(test, input);
export const assertProviderControlEnvelope = (input: unknown) => parse(remove, input);

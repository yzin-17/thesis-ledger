import { z } from 'zod';

/** 账户接口接受情况，独立于历史覆盖、业务记录和数据读取准入。 */
export const marketAccountAccessSchema = z.strictObject({
  state: z.enum(['allowed', 'permission_missing', 'credential_missing', 'credential_invalid', 'unknown']),
  attempted: z.boolean(),
  errorCode: z.string().min(1).optional(),
  checkedAt: z.iso.datetime({ offset: true }).optional(),
  validUntil: z.iso.datetime({ offset: true }).optional(),
  configVersion: z.number().int().nonnegative().optional(),
}).superRefine((value, context) => {
  if (['allowed', 'permission_missing', 'credential_invalid'].includes(value.state) && !value.attempted)
    context.addIssue({ code: 'custom', message: '账户访问结论必须来自实际接口请求' });
  if (value.state === 'allowed' && value.errorCode)
    context.addIssue({ code: 'custom', message: '可访问状态不能包含错误' });
  if (value.state === 'allowed' && (!value.checkedAt || !value.validUntil || value.configVersion === undefined))
    context.addIssue({ code: 'custom', message: '可访问状态必须保留有效时间' });
  if ((value.checkedAt === undefined) !== (value.validUntil === undefined) ||
      (value.checkedAt && value.validUntil && Date.parse(value.checkedAt) >= Date.parse(value.validUntil)))
    context.addIssue({ code: 'custom', message: '账户检查有效时间必须完整且有序' });
});
export type MarketAccountAccess = z.infer<typeof marketAccountAccessSchema>;

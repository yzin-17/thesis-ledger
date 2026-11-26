import { z } from 'zod';
import { backtestOrderValiditySchema } from './backtest-daily-orders.js';

export const authoringModificationTargetSchema = z.enum([
  'entry',
  'exit',
  'sizing',
  'risk',
  'cost',
  'tradePlan',
  'execution',
  'entryOrderValidity',
]);
export type AuthoringModificationTarget = z.infer<typeof authoringModificationTargetSchema>;
export const authoringModificationTargetOptions: {
  value: AuthoringModificationTarget;
  label: string;
}[] = [
  { value: 'entry', label: '入场规则' },
  { value: 'exit', label: '退出规则' },
  { value: 'sizing', label: '仓位' },
  { value: 'risk', label: '固定止损' },
  { value: 'tradePlan', label: '交易计划' },
  { value: 'execution', label: '委托计划' },
  { value: 'entryOrderValidity', label: '买单有效期' },
  { value: 'cost', label: '交易成本' },
];

export const authoringOrderValidityChangeSchema = z.discriminatedUnion('change', [
  z.strictObject({
    change: z.literal('validity'),
    templateId: z.string().min(1),
    requirementId: z.string().min(1),
    value: z.discriminatedUnion('kind', [
      backtestOrderValiditySchema.options[0],
      backtestOrderValiditySchema.options[1],
    ]),
  }),
  z.strictObject({ change: z.literal('unsupported') }),
]);

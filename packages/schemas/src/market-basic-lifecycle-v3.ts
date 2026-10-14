import { z } from 'zod';
import type { structuredStatusRecordSchema } from './market-structured-status-v3.js';

const state = z.enum(['known', 'notProvided', 'invalid', 'unavailable']);
export const marketBasicLifecycleV3Schema = z
  .strictObject({
    ipoDate: z.iso.date().nullable(),
    outDate: z.iso.date().nullable(),
    ipoDateStatus: state,
    outDateStatus: state,
    sourceRecordId: z.string().min(1).optional(),
    reason: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    for (const field of ['ipoDate', 'outDate'] as const) {
      if ((value[field] !== null) !== (value[`${field}Status`] === 'known'))
        context.addIssue({ code: 'custom', path: [field], message: '基础日期与已知状态不一致' });
    }
    if (value.ipoDate && value.outDate && value.outDate < value.ipoDate)
      context.addIssue({ code: 'custom', path: ['outDate'], message: '摘牌日早于上市日' });
    const unavailable =
      value.ipoDateStatus === 'unavailable' || value.outDateStatus === 'unavailable';
    if (
      unavailable &&
      (value.ipoDateStatus !== 'unavailable' || value.outDateStatus !== 'unavailable')
    )
      context.addIssue({
        code: 'custom',
        path: ['ipoDateStatus'],
        message: '来源整体不可用时两日期均须未知',
      });
    if (unavailable ? !value.reason || Boolean(value.sourceRecordId) : !value.sourceRecordId)
      context.addIssue({
        code: 'custom',
        path: ['sourceRecordId'],
        message: '基础日期须保留实际来源或不可用原因',
      });
  });
export type MarketBasicLifecycleV3 = z.infer<typeof marketBasicLifecycleV3Schema>;

export function basicLifecycleIssues(value: {
  days: Array<{ sourceRecordIds?: string[] | undefined }>;
  basicLifecycle?: MarketBasicLifecycleV3 | undefined;
  sourceRecords?: z.infer<typeof structuredStatusRecordSchema>[] | undefined;
}) {
  const life = value.basicLifecycle;
  if (!life) return [];
  if (!value.sourceRecords?.length) return ['基础日期必须附在实际结构化来源响应'];
  if (!life.sourceRecordId) return [];
  if (value.days.some((day) => day.sourceRecordIds?.includes(life.sourceRecordId!)))
    return ['基础日期不能证明日级交易状态或粗 ST'];
  const record = value.sourceRecords?.find((item) => item.id === life.sourceRecordId);
  if (
    !record ||
    record.providerId !== 'baostock' ||
    record.upstreamSource !== 'baostock' ||
    record.queryMethod !== 'query_stock_basic' ||
    record.queryFields !== 'code,ipoDate,outDate,type' ||
    record.normalizerRevision !== 'baostock-basic-dates-v1'
  )
    return ['基础日期引用不是已实现的单证券基础资料响应'];
  if (
    [life.ipoDate, life.outDate].some(
      (day) => day && Date.parse(`${day}T00:00:00+08:00`) > Date.parse(record.observedAt),
    )
  )
    return ['基础日期不能晚于实际观察时钟'];
  return [];
}

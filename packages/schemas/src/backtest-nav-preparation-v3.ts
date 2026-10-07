import { z } from 'zod';
import { backtestNavRunConfigV3Schema } from './backtest-nav-freeze-v3.js';

const calendarDecision = z.strictObject({
  schemaVersion: z.literal('nav-research-calendar-decision-v1'),
  symbol: z.string().regex(/^\d{6}\.OF$/),
  basis: z.literal('nav-dates-xshg-intersection-v1'),
  configuredAt: z.iso.datetime({ offset: true }),
  decision: z.string().trim().min(1),
});
const domesticDecision = z.strictObject({
  schemaVersion: z.literal('nav-research-default-v1'),
  symbol: z.string().regex(/^\d{6}\.OF$/),
  fundType: z.literal('domestic'),
  delayWorkdays: z.literal(1),
  applicableRange: z.strictObject({ startDate: z.iso.date(), endDate: z.iso.date() }),
  configuredAt: z.iso.datetime({ offset: true }),
  decision: z.string().trim().min(1),
});

/** 调用方提供意图，实际来源、规则和冻结时点由 Server 决定。 */
const config = z
  .strictObject(backtestNavRunConfigV3Schema.shape)
  .omit({ dataAsOf: true, navVisibility: true })
  .superRefine((value, ctx) => {
    // 复用现行配置约束；占位时点只用于结构核验，不成为准备或来源证据。
    const parsed = backtestNavRunConfigV3Schema.safeParse({
      ...value,
      dataAsOf: '1970-01-01T00:00:00Z',
      navVisibility: { mode: 'strict-publication' },
    });
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        ctx.addIssue({
          code: 'custom',
          path: issue.path,
          message: issue.message,
        });
  });
const fields = z.strictObject({
  contractVersion: z.literal(3),
  requestId: z.string().trim().min(1).max(128),
  runConfig: config,
  fundType: z.enum(['domestic', 'qdii']),
  visibilityMode: z.literal('research-assumption'),
  freezeTimePolicy: z.literal('after-acquisition'),
  calendarDecisionRaw: z.string().min(1).max(65536),
  domesticRuleDecisionRaw: z.string().min(1).max(65536).nullable(),
});

function validateIntent(value: z.infer<typeof fields>, ctx: z.RefinementCtx) {
  try {
    const calendar = calendarDecision.parse(JSON.parse(value.calendarDecisionRaw));
    if (calendar.symbol !== value.runConfig.navInput.symbol) throw new Error('基金不一致');
    if (value.fundType === 'qdii') {
      if (value.domesticRuleDecisionRaw !== null) throw new Error('QDII 不能使用普通规则');
    } else {
      const rule = domesticDecision.parse(JSON.parse(value.domesticRuleDecisionRaw ?? 'null'));
      if (
        rule.symbol !== calendar.symbol ||
        rule.applicableRange.startDate > value.runConfig.startDate ||
        rule.applicableRange.endDate < value.runConfig.endDate
      )
        throw new Error('普通规则范围不一致');
    }
  } catch {
    ctx.addIssue({ code: 'custom', message: 'NAV 研究决策缺失、基金身份或规则区间不一致' });
  }
}

export const backtestNavPreparationIntentV3Schema = fields.superRefine(validateIntent);
export const backtestNavPreparationRequestV3Schema = fields
  .extend({ strategyVersionId: z.uuid() })
  .superRefine(validateIntent);
export type BacktestNavPreparationIntentV3 = z.infer<typeof backtestNavPreparationIntentV3Schema>;
export type BacktestNavPreparationRequestV3 = z.infer<typeof backtestNavPreparationRequestV3Schema>;

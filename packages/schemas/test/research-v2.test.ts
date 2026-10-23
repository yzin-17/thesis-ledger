import { expect, it } from 'vitest';
import {
  aiFrozenResearchV2Schema,
  aiGenerationContractRefSchema,
  aiGenerationContracts,
  correlateResearchResultV2,
  researchGenerationV2Schema,
  researchGenerationV2Contract,
  researchHistoricalScopeV2Schema,
  researchResultSchema,
  researchResultV2Schema,
  researchScopeSnapshotV2Schema,
  researchSubmissionV2Schema,
  versionedResearchResultSchema,
  type AiFrozenResearchV2,
  type ResearchGenerationV2,
  type ResearchResultV2,
} from '../src/index.js';
import { researchV2Fixture } from './fixtures/research-v2.js';

it('V2 提交、冻结、推断和最终绑定使用不同严格合同，现有 SDK 默认仍是 V1', () => {
  const f = researchV2Fixture();
  expect(researchSubmissionV2Schema.parse(f.input)).toEqual(f.input);
  expect(aiFrozenResearchV2Schema.parse(f.frozen)).toEqual(f.frozen);
  expect(researchGenerationV2Schema.parse(f.generation)).toEqual(f.generation);
  expect(correlateResearchResultV2(f.frozen, f.result, [f.toolCallId])).toEqual(f.result);
  expect(versionedResearchResultSchema.parse(f.result)).toEqual(f.result);
  expect(researchResultSchema.safeParse(f.result).success).toBe(false);
  expect(aiGenerationContractRefSchema.parse(researchGenerationV2Contract.ref)).toEqual(
    researchGenerationV2Contract.ref,
  );
  expect(aiGenerationContracts.research.ref.version).toBe('research-generation-v1');
});

it('V1 保持原结构，未知版本不降级为 V1', () => {
  const legacy = {
    version: 1,
    provider: 'controlled',
    conclusion: '旧报告',
    evidence: [],
    risks: [],
    unknowns: [],
    disclaimer: '测试',
    createdAt: '2026-10-18T00:00:00Z',
  };
  expect(versionedResearchResultSchema.parse(legacy)).toEqual(researchResultSchema.parse(legacy));
  expect(versionedResearchResultSchema.safeParse({ ...legacy, version: 3 }).success).toBe(false);
});

it.each(['scopeSnapshot', 'frozenResearch', 'providerId', 'cost', 'sourceAudit', 'permissions'])(
  '用户提交拒绝伪造 %s',
  (field) => {
    expect(
      researchSubmissionV2Schema.safeParse({ ...researchV2Fixture().input, [field]: {} }).success,
    ).toBe(false);
  },
);

it.each([
  { scope: 'portfolio' },
  { scope: 'account', accountId: '00000000-0000-4000-8000-000000000010' },
  { scope: 'position', accountId: '00000000-0000-4000-8000-000000000010', symbol: '600519.SH' },
  { scope: 'strategy', strategyVersionId: '00000000-0000-4000-8000-000000000011' },
])('既有范围可独立表达且不接收其他范围字段：%j', (scope) => {
  const f = researchV2Fixture();
  expect(researchSubmissionV2Schema.safeParse({ ...f.input, scope }).success).toBe(true);
  expect(
    researchSubmissionV2Schema.safeParse({
      ...f.input,
      scope: { ...scope, instrumentId: f.instrumentId },
    }).success,
  ).toBe(false);
});

it.each([
  { scope: 'position', symbol: '600519.SH' },
  { scope: 'strategy', accountId: 'invalid' },
  { scope: 'instrument', instrumentId: '同名证券' },
  {
    scope: 'instrument',
    instrumentId: '00000000-0000-4000-8000-000000000001',
    accountId: 'private',
  },
])('范围拒绝不完整或交叉身份：%j', (scope) => {
  expect(
    researchSubmissionV2Schema.safeParse({ ...researchV2Fixture().input, scope }).success,
  ).toBe(false);
});

const frozenFailures: [string, (value: AiFrozenResearchV2) => void][] = [
  [
    '提交模式与快照不符',
    (value) => {
      value.request.mode = 'actual';
    },
  ],
  [
    '提交对象与快照不符',
    (value) => {
      value.request.scope = {
        scope: 'instrument',
        instrumentId: '00000000-0000-4000-8000-000000000099',
      };
    },
  ],
  [
    '提交设置修订不符',
    (value) => {
      value.request.researchSettingsRevision = 'changed';
    },
  ],
  [
    '必需证据不可引用',
    (value) => {
      value.evidence[0]!.usable = false;
      value.evidence[0]!.reasons = ['缺资料'];
    },
  ],
  [
    '不可用被复活',
    (value) => {
      value.evidence[0]!.status = 'unavailable';
      value.evidence[0]!.reasons = ['上游失败'];
    },
  ],
  [
    '无资料仍可引用',
    (value) => {
      value.evidence[0]!.data = null;
    },
  ],
  [
    '未知抓取被标为可用',
    (value) => {
      value.evidence[0]!.audit.fetchedAt = null;
    },
  ],
  [
    '未知来源被标为可用',
    (value) => {
      value.evidence[0]!.audit.providerId = null;
    },
  ],
  [
    '重复证据身份',
    (value) => {
      value.evidence.push(structuredClone(value.evidence[0]!));
    },
  ],
  [
    '未来截止时间',
    (value) => {
      value.dataCutoffAt = '2026-10-18T08:01:00.000001Z';
    },
  ],
  [
    '未来来源时点',
    (value) => {
      value.evidence[0]!.audit.availableAt = '2026-10-18T08:00:30.000001Z';
    },
  ],
  [
    '未来范围确认',
    (value) => {
      value.scopeSnapshot.confirmedAt = '2026-10-18T09:00:00Z';
    },
  ],
  [
    '部分资料伪装完整',
    (value) => {
      value.evidence[0]!.status = 'partial';
      value.evidence[0]!.reasons = ['时间未知'];
    },
  ],
  [
    '隐式私人资料',
    (value) => {
      value.evidence[0]!.audit.kind = 'portfolio';
    },
  ],
];
it.each(frozenFailures)('冻结拒绝%s', (_label, corrupt) => {
  const f = researchV2Fixture();
  corrupt(f.frozen);
  expect(aiFrozenResearchV2Schema.safeParse(f.frozen).success).toBe(false);
});

it('部分资料保留未知时间和原因，非必需失败不合成资料', () => {
  const f = researchV2Fixture();
  f.frozen.evidence[0]!.status = 'partial';
  f.frozen.evidence[0]!.reasons = ['source_time_unknown'];
  f.frozen.quality = { status: 'partial', reasons: ['source_time_unknown'] };
  const optional = structuredClone(f.frozen.evidence[0]!);
  optional.audit.evidenceId = '00000000-0000-4000-8000-000000000005';
  optional.audit.providerId = null;
  optional.audit.contractVersion = null;
  optional.audit.fetchedAt = null;
  optional.status = 'unavailable';
  optional.data = null;
  optional.required = false;
  optional.usable = false;
  optional.reasons = ['service_unavailable'];
  f.frozen.evidence.push(optional);
  const parsed = aiFrozenResearchV2Schema.parse(f.frozen);
  expect(parsed.evidence[1]!.data).toBeNull();
  expect(parsed.evidence[1]!.audit.providerId).toBeNull();
});

it.each([
  'scopeSnapshot',
  'evidenceBindings',
  'providerId',
  'permissions',
  'cost',
  'inputFingerprint',
])('模型推断拒绝伪造 %s', (field) => {
  expect(
    researchGenerationV2Schema.safeParse({ ...researchV2Fixture().generation, [field]: {} })
      .success,
  ).toBe(false);
});

const modelFailures: [string, (value: ResearchGenerationV2) => void][] = [
  [
    '重复断言',
    (value) => {
      value.claims.push(structuredClone(value.claims[0]!));
    },
  ],
  [
    '无效动作引用',
    (value) => {
      value.nextSteps[1]!.claimId = 'absent';
    },
  ],
  [
    '无证据查看动作',
    (value) => {
      value.nextSteps[0]!.evidenceIds = [];
    },
  ],
  [
    '无限数值',
    (value) => {
      if (value.numericClaims[1]!.kind === 'derived') value.numericClaims[1].value = Infinity;
    },
  ],
  [
    '原型字段路径',
    (value) => {
      if (value.numericClaims[0]!.kind === 'field')
        value.numericClaims[0].source.fieldPath = '/__proto__/price';
    },
  ],
];
it.each(modelFailures)('模型合同拒绝%s', (_label, corrupt) => {
  const f = researchV2Fixture();
  corrupt(f.generation);
  expect(researchGenerationV2Schema.safeParse(f.generation).success).toBe(false);
});

it('下一步只表达研究动作；不能增加订单指令或概率校准字段', () => {
  const f = researchV2Fixture();
  expect(
    researchGenerationV2Schema.safeParse({
      ...f.generation,
      nextSteps: [{ action: 'execute_order', description: '交易', evidenceIds: [], claimId: null }],
    }).success,
  ).toBe(false);
  expect(
    researchGenerationV2Schema.safeParse({
      ...f.generation,
      confidence: { ...f.generation.confidence, calibratedProbability: 0.9 },
    }).success,
  ).toBe(false);
});

const resultFailures: [string, (value: ResearchResultV2) => void][] = [
  [
    '引用本次集合外证据',
    (value) => {
      value.inference.claims[0]!.evidenceIds = ['00000000-0000-4000-8000-000000000099'];
    },
  ],
  [
    '引用其他标的',
    (value) => {
      if (value.inference.claims[0]!.kind === 'price-direction')
        value.inference.claims[0].instrumentId = '00000000-0000-4000-8000-000000000099';
    },
  ],
  [
    '条件币种错绑',
    (value) => {
      if (value.inference.invalidationConditions[0]!.kind === 'price-threshold')
        value.inference.invalidationConditions[0].currency = 'USD';
    },
  ],
  [
    '重复成功引用',
    (value) => {
      value.evidenceBindings.push(structuredClone(value.evidenceBindings[0]!));
    },
  ],
  [
    '未知来源被绑定',
    (value) => {
      value.evidenceBindings[0]!.audit.providerId = null;
    },
  ],
];
it.each(resultFailures)('最终产物拒绝%s', (_label, corrupt) => {
  const f = researchV2Fixture();
  corrupt(f.result);
  expect(researchResultV2Schema.safeParse(f.result).success).toBe(false);
});

const exchangeFailures: [string, (value: ResearchResultV2) => void][] = [
  [
    '输入指纹',
    (value) => {
      value.inputFingerprint = 'c'.repeat(64);
    },
  ],
  [
    '模式',
    (value) => {
      value.scopeSnapshot.mode = 'actual';
    },
  ],
  [
    'Prompt',
    (value) => {
      value.promptVersion = 'other-prompt';
    },
  ],
  [
    '截止时点',
    (value) => {
      value.dataCutoffAt = '2026-10-18T08:00:00Z';
    },
  ],
  [
    '模型设置修订',
    (value) => {
      value.model.researchSettingsRevision = 'other';
    },
  ],
  [
    '质量',
    (value) => {
      value.quality = { status: 'partial', reasons: ['changed'] };
    },
  ],
  [
    '来源',
    (value) => {
      value.evidenceBindings[0]!.audit.providerId = 'forged';
    },
  ],
  [
    '凭据修订',
    (value) => {
      value.evidenceBindings[0]!.audit.credentialRevision = 'forged';
    },
  ],
];
it.each(exchangeFailures)('最终绑定拒绝改变冻结%s', (_label, corrupt) => {
  const f = researchV2Fixture();
  corrupt(f.result);
  expect(() => correlateResearchResultV2(f.frozen, f.result, [f.toolCallId])).toThrow();
});

it('不属于当前任务的 Tool 调用不能绑定成功引用', () => {
  const f = researchV2Fixture();
  expect(() => correlateResearchResultV2(f.frozen, f.result, [])).toThrow();
});

it('历史未知范围不能通过当前模式或缺省值变成 known', () => {
  expect(
    researchHistoricalScopeV2Schema.parse({
      status: 'unrecorded',
      snapshot: null,
      label: '历史范围未记录',
    }),
  ).toEqual({ status: 'unrecorded', snapshot: null, label: '历史范围未记录' });
  expect(
    researchHistoricalScopeV2Schema.safeParse({
      status: 'unrecorded',
      snapshot: null,
      label: '历史范围未记录',
      mode: 'actual',
    }).success,
  ).toBe(false);
  expect(
    researchHistoricalScopeV2Schema.safeParse({ status: 'known', snapshot: { mode: 'actual' } })
      .success,
  ).toBe(false);
});

it('范围快照拒绝跨市场代码与不支持币种，不向目录缺失补默认值', () => {
  const f = researchV2Fixture();
  if (f.frozen.scopeSnapshot.scope !== 'instrument') throw new Error('样例范围不符');
  f.frozen.scopeSnapshot.instrument.market = 'US';
  expect(researchScopeSnapshotV2Schema.safeParse(f.frozen.scopeSnapshot).success).toBe(false);
  f.frozen.scopeSnapshot.instrument.market = 'CN';
  expect(
    researchScopeSnapshotV2Schema.safeParse({
      ...f.frozen.scopeSnapshot,
      instrument: { ...f.frozen.scopeSnapshot.instrument, currency: 'ZZZ' },
    }).success,
  ).toBe(false);
});

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { researchGenerationV2Schema, type ResearchGenerationV2 } from '@thesis-ledger/schemas';
import {
  sealAiFrozenResearchV2,
  verifyAiFrozenResearchV2,
} from '../../src/ai/ai-research-frozen-integrity-v2.js';
import { verifyResearchNumericEvidenceV2 } from '../../src/ai/ai-research-numeric-evidence-v2.js';
import { submissionV2Fixture } from './research-submission-v2.fixture.js';

function fixture() {
  const { frozen } = submissionV2Fixture();
  frozen.evidence[0]!.data = {
    price: 100,
    ratio: 0.1,
    other: 2,
    zero: 0,
    currency: 'CNY',
    'a/b': { value: 4 },
  };
  frozen.evidence[0]!.numericFields = [
    { fieldPath: '/price', unit: 'price', currency: 'CNY' },
    { fieldPath: '/ratio', unit: 'ratio', currency: null },
    { fieldPath: '/other', unit: 'price', currency: 'CNY' },
    { fieldPath: '/zero', unit: 'price', currency: 'CNY' },
    { fieldPath: '/a~1b/value', unit: 'count', currency: null },
  ];
  const sample = JSON.parse(
    readFileSync(
      new URL('../../../../packages/schemas/fixtures/research-v2.samples.json', import.meta.url),
      'utf8',
    ),
  ) as { generation: unknown };
  return {
    frozen: sealAiFrozenResearchV2(frozen),
    inference: researchGenerationV2Schema.parse(sample.generation),
  };
}

it('实际内容和服务端数值映射形成可验证指纹，JSON 对象键序不影响协议', () => {
  const { frozen, inference } = fixture();
  expect(verifyAiFrozenResearchV2(frozen)).toEqual(frozen);
  expect(verifyResearchNumericEvidenceV2(frozen, inference)).toEqual(inference);
  const reordered = structuredClone(frozen);
  const entry = reordered.evidence[0]!;
  if (entry.data === null || typeof entry.data !== 'object' || Array.isArray(entry.data))
    throw new Error('合成对象缺失');
  entry.data = Object.fromEntries(Object.entries(entry.data).reverse());
  expect(sealAiFrozenResearchV2(reordered).inputFingerprint).toBe(frozen.inputFingerprint);
});

it.each(['data', 'source', 'unit', 'question', 'mode', 'identity', 'cutoff'] as const)(
  '读取时拒绝被改写的 %s，不能替历史重签',
  (kind) => {
    const { frozen } = fixture();
    const changed = structuredClone(frozen);
    if (kind === 'data') changed.evidence[0]!.data = { price: 101, currency: 'CNY' };
    else if (kind === 'source') changed.evidence[0]!.audit.sourceIds.push('other');
    else if (kind === 'unit') changed.evidence[0]!.numericFields[0]!.currency = 'USD';
    else if (kind === 'question') changed.request.question = '另一个问题';
    else if (kind === 'mode') {
      changed.request.mode = 'actual';
      changed.scopeSnapshot.mode = 'actual';
    } else if (kind === 'identity') changed.evidence[0]!.audit.evidenceId = randomUUID();
    else changed.dataCutoffAt = '2026-10-18T08:00:31Z';
    expect(() => verifyAiFrozenResearchV2(changed)).toThrow('指纹');
    expect(frozen).not.toEqual(changed);
  },
);

it.each(['value', 'field', 'unit', 'currency', 'evidence'] as const)(
  '数值引用的 %s 必须与服务端冻结事实一致',
  (kind) => {
    const { frozen, inference } = fixture();
    const claim = inference.numericClaims[0]!;
    if (claim.kind !== 'field') throw new Error('直接字段样例缺失');
    if (kind === 'value') claim.source.value = 101;
    else if (kind === 'field') claim.source.fieldPath = '/missing';
    else if (kind === 'unit') claim.source.unit = 'ratio';
    else if (kind === 'currency') claim.source.currency = 'USD';
    else claim.source.evidenceId = randomUUID();
    expect(() => verifyResearchNumericEvidenceV2(frozen, inference)).toThrow();
  },
);

it('布尔值不变成 1，高精度原数值不因转 Number 变成可用事实', () => {
  const { frozen, inference } = fixture();
  for (const price of [true, '100.0000000000000001']) {
    const changed = structuredClone(frozen);
    changed.evidence[0]!.data = { price, currency: 'CNY' };
    expect(() =>
      verifyResearchNumericEvidenceV2(sealAiFrozenResearchV2(changed), inference),
    ).toThrow();
  }
});

it('必需的空/未知材料即使指纹正确，也不能进入模型执行', () => {
  for (const data of [{}, { status: 'unknown' }, { items: [] }]) {
    const { frozen } = fixture();
    frozen.evidence[0]!.data = data;
    expect(() => verifyAiFrozenResearchV2(sealAiFrozenResearchV2(frozen))).toThrow('实际材料');
  }
});

it('JSON Pointer 解码只访问自有字段，数值映射为空或重复均不放行', () => {
  const { frozen, inference } = fixture();
  const source = {
    evidenceId: frozen.evidence[0]!.audit.evidenceId,
    fieldPath: '/a~1b/value',
    value: 4,
    unit: 'count',
    currency: null,
  };
  inference.numericClaims = [{ id: 'field', description: '合成字段', kind: 'field', source }];
  expect(() => verifyResearchNumericEvidenceV2(frozen, inference)).not.toThrow();
  const empty = structuredClone(frozen);
  empty.evidence[0]!.numericFields = [];
  expect(() => verifyResearchNumericEvidenceV2(sealAiFrozenResearchV2(empty), inference)).toThrow();
  frozen.evidence[0]!.numericFields.push(frozen.evidence[0]!.numericFields[0]!);
  expect(() => sealAiFrozenResearchV2(frozen)).toThrow('不能重复');
});

type Derived = Extract<ResearchGenerationV2['numericClaims'][number], { kind: 'derived' }>;
function derived(
  operation: Derived['operation'],
  value: number,
  left = '/price',
  right = '/other',
  unit = 'price',
  currency: 'CNY' | null = 'CNY',
) {
  const { frozen, inference } = fixture();
  const fields = {
    '/price': { value: 100, unit: 'price', currency: 'CNY' },
    '/other': { value: 2, unit: 'price', currency: 'CNY' },
    '/zero': { value: 0, unit: 'price', currency: 'CNY' },
    '/ratio': { value: 0.1, unit: 'ratio', currency: null },
  } as const;
  const operand = (path: string) => ({
    evidenceId: frozen.evidence[0]!.audit.evidenceId,
    fieldPath: path,
    ...fields[path as keyof typeof fields],
  });
  inference.numericClaims = [
    {
      id: 'derived',
      description: '合成运算',
      kind: 'derived',
      operation,
      operands: [operand(left), operand(right)],
      value,
      unit,
      currency,
      assumptions: [],
    },
  ];
  return { frozen, inference };
}

it.each([
  ['add', 102, '/price', '/other', 'price', 'CNY'],
  ['subtract', 98, '/price', '/other', 'price', 'CNY'],
  ['multiply', 10, '/price', '/ratio', 'price', 'CNY'],
  ['divide', 50, '/price', '/other', 'ratio', null],
  ['percentage_change', -0.98, '/price', '/other', 'ratio', null],
] as const)('派生 %s 使用实际操作数和固定量纲', (operation, value, left, right, unit, currency) => {
  const fixture = derived(operation, value, left, right, unit, currency);
  expect(() => verifyResearchNumericEvidenceV2(fixture.frozen, fixture.inference)).not.toThrow();
});

it.each([
  ['add', 100, '/price', '/ratio', 'price', 'CNY'],
  ['multiply', 200, '/price', '/other', 'price', 'CNY'],
  ['divide', 0, '/price', '/zero', 'ratio', null],
  ['percentage_change', 0, '/zero', '/price', 'ratio', null],
  ['percentage_change', -98, '/price', '/other', 'ratio', null],
  ['divide', 50, '/price', '/other', 'price', 'CNY'],
] as const)(
  '拒绝派生 %s 的错误结果、量纲或零分母',
  (operation, value, left, right, unit, currency) => {
    const fixture = derived(operation, value, left, right, unit, currency);
    expect(() => verifyResearchNumericEvidenceV2(fixture.frozen, fixture.inference)).toThrow();
  },
);

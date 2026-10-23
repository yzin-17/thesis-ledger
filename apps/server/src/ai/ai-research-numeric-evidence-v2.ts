import { Prisma } from '@prisma/client';
import {
  researchGenerationV2Schema,
  type AiFrozenResearchV2,
  type ResearchGenerationV2,
  type ResearchFrozenEvidenceV2,
} from '@thesis-ledger/schemas';

type NumericClaim = ResearchGenerationV2['numericClaims'][number];
type Field = Extract<NumericClaim, { kind: 'field' }>['source'];
type Identity = Pick<Field, 'unit' | 'currency'>;
const sameUnit = (left: Identity, right: Identity) =>
  left.unit === right.unit && left.currency === right.currency;
const ratio = (value: Identity) => value.unit === 'ratio' && value.currency === null;

function fieldData(data: unknown, path: string): unknown {
  let value = data;
  for (const raw of path.slice(1).split('/')) {
    const key = raw.replaceAll('~1', '/').replaceAll('~0', '~');
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key))
      throw new Error('数值引用路径不在冻结数据内');
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function actualField(field: Field, evidence: ReadonlyMap<string, ResearchFrozenEvidenceV2>) {
  const source = evidence.get(field.evidenceId);
  const descriptor = source?.numericFields.find((entry) => entry.fieldPath === field.fieldPath);
  if (!source?.usable || !descriptor || !sameUnit(descriptor, field))
    throw new Error('数值引用缺少本次可用字段或单位/币种不一致');
  const value = fieldData(source.data, field.fieldPath);
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && !/^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(value))
  )
    throw new Error('数值引用不能把非数值材料转换为事实');
  const actual = new Prisma.Decimal(value);
  if (!actual.isFinite() || !actual.equals(new Prisma.Decimal(String(field.value))))
    throw new Error('数值引用与冻结字段实际取值不一致');
  return actual;
}

function derivedIdentity(claim: Extract<NumericClaim, { kind: 'derived' }>): Identity {
  const [left, right] = claim.operands;
  if (claim.operation === 'multiply') {
    if (ratio(left)) return right;
    if (ratio(right)) return left;
    throw new Error('乘法只支持无币种比例与已知数值');
  }
  if (claim.operation === 'divide') {
    if (ratio(right)) return left;
    if (sameUnit(left, right)) return { unit: 'ratio', currency: null };
    throw new Error('除法量纲或币种不兼容');
  }
  if (!sameUnit(left, right)) throw new Error('派生数值的操作数单位或币种不一致');
  if (claim.operation === 'percentage_change') return { unit: 'ratio', currency: null };
  return left;
}

function derivedValue(
  operation: Extract<NumericClaim, { kind: 'derived' }>['operation'],
  left: Prisma.Decimal,
  right: Prisma.Decimal,
) {
  if (operation === 'add') return left.plus(right);
  if (operation === 'subtract') return left.minus(right);
  if (operation === 'multiply') return left.times(right);
  if (operation === 'divide') {
    if (right.isZero()) throw new Error('派生数值除数为零');
    return left.dividedBy(right);
  }
  if (left.isZero()) throw new Error('比例变化基值为零');
  return right.minus(left).dividedBy(left);
}

/** 验证结构化数字；自由文本仍属于模型推断，不声称已自动核验全部事实。 */
export function verifyResearchNumericEvidenceV2(frozen: AiFrozenResearchV2, raw: unknown) {
  const inference = researchGenerationV2Schema.parse(raw);
  const evidence = new Map(frozen.evidence.map((entry) => [entry.audit.evidenceId, entry]));
  for (const claim of inference.numericClaims) {
    if (claim.kind === 'field') {
      actualField(claim.source, evidence);
      continue;
    }
    const left = actualField(claim.operands[0], evidence);
    const right = actualField(claim.operands[1], evidence);
    if (!sameUnit(derivedIdentity(claim), claim))
      throw new Error('派生结果单位或币种不符合运算合同');
    const actual = derivedValue(claim.operation, left, right);
    const value = actual.toNumber();
    if (
      !actual.isFinite() ||
      !Number.isFinite(value) ||
      (value === 0 && !actual.isZero()) ||
      claim.value !== value
    )
      throw new Error('派生结果与冻结操作数的实际运算不一致');
  }
  return inference;
}

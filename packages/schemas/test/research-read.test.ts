import { expect, it } from 'vitest';
import {
  researchReportLocatorSchema,
  researchReportListQuerySchema,
  researchReportDetailSchema,
  researchReportSelection,
} from '../src/research-read.js';
import { researchV2Fixture } from './fixtures/research-v2.js';
import { normalizeResearchSubmissionV2 } from '../src/research-scope-v2.js';

const id = '00000000-0000-4000-8000-000000000011';
it('查询与提交共用规范身份且不改写调用方输入', () => {
  const uuid = 'a1111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const fixture = researchV2Fixture();
  const input = {
    ...fixture.input,
    submissionId: uuid.toUpperCase(),
    scope: { scope: 'position' as const, accountId: uuid.toUpperCase(), symbol: '600519.sh' },
  };
  expect(normalizeResearchSubmissionV2(input)).toMatchObject({
    submissionId: uuid,
    scope: { accountId: uuid, symbol: '600519.SH' },
  });
  expect(input.scope.symbol).toBe('600519.sh');
  expect(
    researchReportLocatorSchema.parse({
      view: 'scoped',
      mode: 'shadow',
      scope: 'position',
      accountId: uuid.toUpperCase(),
      symbol: '600519.sh',
    }),
  ).toMatchObject({ accountId: uuid, symbol: '600519.SH' });
});
it.each([
  { view: 'scoped' },
  { view: 'legacy', mode: 'actual' },
  { view: 'scoped', mode: 'shadow', scope: 'all', accountId: id },
  { view: 'scoped', mode: 'shadow', scope: 'account' },
  { view: 'scoped', mode: 'shadow', scope: 'account', accountId: id, instrumentId: id },
  { view: 'scoped', mode: 'shadow', ownerId: id },
  { view: 'legacy', limit: 51 },
  { view: 'legacy', cursor: '' },
  { view: 'scoped', mode: ['actual', 'shadow'] },
  { view: 'scoped', mode: 'shadow', kind: 'account', scope: 'instrument', instrumentId: id },
  { view: 'legacy', kind: 'account' },
  { view: 'scoped', mode: 'shadow', kind: 'internal' },
])('研究读取拒绝缺失、混用或越界参数：%j', (query) => {
  expect(researchReportListQuerySchema.safeParse(query).success).toBe(false);
});
it('类别筛选不要求虚构对象身份；精确范围仍要求真实 ID', () => {
  expect(
    researchReportListQuerySchema.parse({ view: 'scoped', mode: 'shadow', kind: 'account' }),
  ).toMatchObject({ kind: 'account', scope: 'all' });
  expect(
    researchReportLocatorSchema.safeParse({
      view: 'scoped',
      mode: 'shadow',
      kind: 'account',
      scope: 'account',
    }).success,
  ).toBe(false);
});
it('分页字段不改变对象定位；历史入口不补模式', () => {
  const query = researchReportListQuerySchema.parse({
    view: 'scoped',
    mode: 'shadow',
    scope: 'account',
    accountId: id,
    search: '风险',
    limit: 1,
  });
  expect(researchReportSelection(query)).toEqual({ scope: 'account', accountId: id });
  expect(researchReportLocatorSchema.parse({ view: 'legacy' })).toEqual({ view: 'legacy' });
});
it('V2 产物必须保持读取范围；不能进入未知历史范围', () => {
  const fixture = researchV2Fixture();
  const detail = {
    id,
    status: 'succeeded',
    question: '受控问题',
    createdAt: fixture.result.createdAt,
    updatedAt: fixture.result.createdAt,
    historicalScope: { status: 'known', snapshot: fixture.result.scopeSnapshot },
    resultVersion: 2,
    availability: 'available',
    summary: fixture.result.inference.conclusion,
    quality: fixture.result.quality,
    errorCode: null,
    errorSummary: null,
    result: fixture.result,
    submission: fixture.input,
  };
  expect(researchReportDetailSchema.safeParse(detail).success).toBe(true);
  expect(
    researchReportDetailSchema.safeParse({
      ...detail,
      historicalScope: { status: 'unrecorded', snapshot: null, label: '历史范围未记录' },
    }).success,
  ).toBe(false);
  expect(
    researchReportDetailSchema.safeParse({
      ...detail,
      historicalScope: {
        status: 'known',
        snapshot: { ...fixture.result.scopeSnapshot, mode: 'actual' },
      },
    }).success,
  ).toBe(false);
});

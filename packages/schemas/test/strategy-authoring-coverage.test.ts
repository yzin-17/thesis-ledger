import { expect, it } from 'vitest';
import { z } from 'zod';
import { authoringRequirementCoverageSchema } from '../src/strategy-authoring-operation-schema.js';
import { authoringGenerationOutputSchema } from '../src/strategy-authoring-generation.js';

it('已知需求逐项冻结标识和顺序，不能重复、漏项或虚构定义路径', () => {
  const requirementIds = ['entry-rule', 'protection-rule'];
  const schema = authoringRequirementCoverageSchema(requirementIds, [
    'entry',
    'sizing',
    'tradePlan',
  ]);
  const first = { requirementId: 'entry-rule', definitionPaths: ['entry', 'sizing'] };
  const second = { requirementId: 'protection-rule', definitionPaths: ['tradePlan'] };
  expect(schema.parse([first, second])).toEqual([first, second]);
  for (const output of [
    [],
    [first],
    [first, first],
    [second, first],
    [first, second, second],
    [first, { ...second, requirementId: 'invented' }],
    [first, { ...second, definitionPaths: ['tradePlan.invented'] }],
    [first, { ...second, definitionPaths: [] }],
  ])
    expect(schema.safeParse(output).success).toBe(false);
  const document = z.toJSONSchema(schema, { target: 'draft-7' });
  expect(document.items).toMatchObject([
    { properties: { requirementId: { const: 'entry-rule' } } },
    { properties: { requirementId: { const: 'protection-rule' } } },
  ]);
  expect(requirementIds).toEqual(['entry-rule', 'protection-rule']);
});

it('空需求精确生成空覆盖，未提供需求列表的通用合同保持原能力', () => {
  expect(authoringRequirementCoverageSchema([], ['entry']).parse([])).toEqual([]);
  expect(
    authoringRequirementCoverageSchema([], ['entry']).safeParse([
      { requirementId: 'invented', definitionPaths: ['entry'] },
    ]).success,
  ).toBe(false);
  expect(
    authoringGenerationOutputSchema.shape.coverage.parse([
      { requirementId: 'known-later', definitionPaths: ['sizing.percent'] },
    ]),
  ).toHaveLength(1);
});

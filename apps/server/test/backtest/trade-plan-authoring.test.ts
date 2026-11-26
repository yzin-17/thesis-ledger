import { expect, it } from 'vitest';
import { validateAuthoringGeneration } from '../../src/strategy-authoring/authoring-semantics.js';
import {
  compiledAuthoringPlan,
  planAuthoringContent,
} from './trade-plan-authoring-content.fixture.js';
import { modelPlanConforms } from './trade-plan-model-evaluation.fixture.js';
import { authoringProposal } from '../strategy-authoring/authoring-proposal.fixture.js';

it.each([false, true])('编写实际校验接受价格研究计划，保留保护类型=%s', (trailing) => {
  const definition = compiledAuthoringPlan(trailing);
  const checked = validateAuthoringGeneration(
    planAuthoringContent(trailing),
    authoringProposal(definition, [{ requirementId: 'rules', definitionPaths: ['entry', 'tradePlan', 'sizing'] }]),
  );
  expect(checked.definition).toEqual(definition);
  expect(modelPlanConforms(trailing ? 'trailing-stop' : 'fixed-stop', checked.definition)).toBe(
    true,
  );
});

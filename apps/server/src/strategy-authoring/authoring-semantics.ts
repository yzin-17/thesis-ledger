import { BadRequestException } from '@nestjs/common';
import { isEqual } from 'es-toolkit';
import {
  authoringStrategySchema,
  authoringGenerationOutputSchema,
  type AuthoringContent,
} from '@thesis-ledger/schemas';
import { authoringSources, matchesAuthoringSource } from './authoring-source-text.js';
import {
  authoringRequirementCapabilityIssue,
  enforceAuthoringCapabilities,
} from './authoring-capability.js';

const reject = (code: string, message: string, issues: string[] = []): never => {
  throw new BadRequestException({ code, message, issues });
};

export function authoringGenerationIssues(content: AuthoringContent) {
  const issues: string[] = [];
  if (!content.confirmation)
    issues.push('请确认目录标的、周期、入场、退出、仓位、风险、执行及费用');
  if (!content.description.trim()) issues.push('策略描述不能为空');
  if (!content.requirements.length) issues.push('请先分析描述并审核需求清单');
  if (content.questions.some((question) => question.answerState !== 'confirmed'))
    issues.push('仍有问题未回答或需要重新审核');
  if (
    content.requirements.some((requirement) =>
      ['unresolved', 'unsupported'].includes(requirement.state),
    )
  )
    issues.push('仍有缺失、矛盾或不支持的需求');
  const sources = authoringSources(content);
  for (const requirement of content.requirements) {
    if (requirement.state !== 'removed') {
      const capabilityIssue = authoringRequirementCapabilityIssue(requirement.quote);
      if (capabilityIssue) issues.push(capabilityIssue);
    }
    if (requirement.state !== 'removed' && !matchesAuthoringSource(sources, requirement.quote))
      issues.push('需求原文必须来自当前描述或已确认答案');
    if (requirement.state === 'removed' && !content.removedRequirements.includes(requirement.quote))
      issues.push('移除需求必须保留明确原文');
  }
  const clauses = content.description
    .split(/[。；;\n]/u)
    .map((item) => item.trim())
    .filter(Boolean);
  for (const clause of clauses) {
    if (!content.requirements.some((requirement) => requirement.quote.includes(clause)))
      issues.push(`需求清单遗漏原文：${clause}`);
  }
  return issues;
}

export function requireAuthoringGeneration(content: AuthoringContent) {
  const issues = authoringGenerationIssues(content);
  if (issues.length) reject('AUTHORING_CONDITIONS_INCOMPLETE', '请完成条件确认和需求审核', issues);
  return content.confirmation!;
}

function resolveDefinitionPath(value: unknown, path: string): unknown {
  const segments = path.replace(/^\//u, '').split(/[/.]/u);
  if (
    !segments.length ||
    segments.some((segment) => ['__proto__', 'constructor', 'prototype'].includes(segment))
  )
    return undefined;
  let current = value;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, segment))
      return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function validateAuthoringGeneration(content: AuthoringContent, raw: unknown) {
  const confirmation = requireAuthoringGeneration(content);
  const output = authoringGenerationOutputSchema.parse(raw);
  const definition = authoringStrategySchema.parse(JSON.stringify(output.definition));
  const constraints = {
    executionInstrument: confirmation.instrument,
    primaryTimeframe: confirmation.timeframe,
    sizing: confirmation.sizing,
    risk: confirmation.risk,
    execution: confirmation.execution,
    cost: confirmation.cost,
  };
  for (const [key, expected] of Object.entries(constraints)) {
    if (!isEqual(definition[key as keyof typeof definition], expected))
      reject('AUTHORING_SEMANTIC_MISMATCH', '生成定义改变了用户确认条件', [key]);
  }
  const ids = new Set<string>();
  for (const coverage of output.coverage) {
    if (
      ids.has(coverage.requirementId) ||
      !content.requirements.some((requirement) => requirement.id === coverage.requirementId)
    )
      reject('AUTHORING_COVERAGE_INVALID', '需求覆盖引用重复或不存在');
    ids.add(coverage.requirementId);
    if (
      coverage.definitionPaths.some((path) => resolveDefinitionPath(definition, path) === undefined)
    )
      reject('AUTHORING_COVERAGE_INVALID', '需求引用未对应实际定义');
  }
  for (const requirement of content.requirements) {
    if (requirement.state === 'understood' && !ids.has(requirement.id))
      reject('AUTHORING_COVERAGE_INCOMPLETE', '生成定义遗漏用户需求', [requirement.id]);
  }
  return { definition, coverage: output.coverage };
}

export function invalidateAuthoringConfirmations(
  previous: AuthoringContent,
  next: AuthoringContent,
  confirmedDefinition = false,
): AuthoringContent {
  next = enforceAuthoringCapabilities(next);
  const descriptionChanged = previous.description !== next.description;
  let definitionChanged = previous.definitionText !== next.definitionText;
  if (definitionChanged) {
    try {
      definitionChanged = !isEqual(
        JSON.parse(previous.definitionText),
        JSON.parse(next.definitionText),
      );
    } catch {
      /* 保留未完成的编辑文本。 */
    }
  }
  const changed = new Set(
    next.questions
      .filter((question) => {
        const old = previous.questions.find((item) => item.id === question.id);
        return old && old.answer !== question.answer;
      })
      .map((question) => question.id),
  );
  const questions = next.questions.map((question) => ({ ...question }));
  let propagated = true;
  while (propagated) {
    propagated = false;
    for (const question of questions) {
      if (
        question.answerState === 'confirmed' &&
        (descriptionChanged || question.dependsOn.some((id) => changed.has(id)))
      ) {
        question.answerState = 'needs_review';
        changed.add(question.id);
        propagated = true;
      }
    }
  }
  if (definitionChanged && !confirmedDefinition)
    return {
      ...next,
      questions,
      confirmation: null,
      requirements: next.requirements.map((requirement) =>
        requirement.state === 'understood' ? { ...requirement, state: 'unresolved' } : requirement,
      ),
    };
  if (!descriptionChanged && changed.size === 0) return { ...next, questions };
  return { ...next, questions, confirmation: null };
}

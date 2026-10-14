import {
  authoringAnalysisOutputSchema,
  authoringContentSchema,
  type AuthoringContent,
} from '@thesis-ledger/schemas';
import {
  authoringSources,
  matchesAuthoringSource,
  currentAuthoringQuestions,
} from './authoring-source-text.js';
import { enforceAuthoringCapabilities } from './authoring-capability.js';

type Question = AuthoringContent['questions'][number];
const fail = (): never => {
  throw new Error('AUTHORING_ANALYSIS_INVALID');
};
const sameQuestion = (left: Question, right: Question) =>
  left.quote === right.quote &&
  left.reason === right.reason &&
  JSON.stringify(left.options) === JSON.stringify(right.options) &&
  JSON.stringify(left.dependsOn) === JSON.stringify(right.dependsOn);

export function validateAuthoringAnalysis(
  content: AuthoringContent,
  revision: number,
  raw: unknown,
) {
  const output = authoringAnalysisOutputSchema.parse(raw);
  const sources = authoringSources(content);
  if (
    output.requirements.some(
      (requirement) =>
        !requirement.quote.trim() || !sources.some((source) => source.includes(requirement.quote)),
    )
  )
    fail();
  if (output.questions.some((question) => question.basedOnRevision !== revision)) fail();
  if (
    output.questions.some(
      (question) =>
        question.quote.trim() && !sources.some((source) => source.includes(question.quote)),
    )
  )
    fail();
  const questions = currentAuthoringQuestions(content, sources);
  for (const question of output.questions) questions.set(question.id, question);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) fail();
    if (visited.has(id)) return;
    const question = questions.get(id) ?? fail();
    visiting.add(id);
    for (const dependency of question.dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of questions.keys()) visit(id);
  for (const requirement of output.requirements) {
    const existing = content.requirements.find((item) => item.id === requirement.id);
    if (
      existing &&
      existing.quote !== requirement.quote &&
      (existing.state === 'removed' || matchesAuthoringSource(sources, existing.quote))
    )
      fail();
  }
  return output;
}

export function mergeAuthoringAnalysis(
  content: AuthoringContent,
  revision: number,
  raw: unknown,
): AuthoringContent {
  const output = validateAuthoringAnalysis(content, revision, raw);
  const sources = authoringSources(content);
  const requirements = new Map(
    content.requirements
      .filter((item) => item.state === 'removed' || matchesAuthoringSource(sources, item.quote))
      .map((item) => [item.id, item]),
  );
  for (const item of output.requirements) {
    const existing = requirements.get(item.id);
    if (existing?.state !== 'removed') requirements.set(item.id, item);
  }
  const questions = new Map(
    [...currentAuthoringQuestions(content, sources).values()].map((item) => [
      item.id,
      { ...item, basedOnRevision: revision + 1 },
    ]),
  );
  for (const item of output.questions) {
    const previous = questions.get(item.id);
    if (previous && sameQuestion(previous, item)) continue;
    questions.set(item.id, {
      ...item,
      basedOnRevision: revision + 1,
      answer: previous?.answer ?? null,
      answerState: previous?.answer ? 'needs_review' : 'unanswered',
    });
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const question of questions.values()) {
      if (
        question.answerState === 'confirmed' &&
        question.dependsOn.some((id) => questions.get(id)?.answerState !== 'confirmed')
      ) {
        question.answerState = 'needs_review';
        changed = true;
      }
    }
  }
  return authoringContentSchema.parse(
    enforceAuthoringCapabilities({
      ...content,
      requirements: [...requirements.values()],
      questions: [...questions.values()],
      runtimeIntents: [...new Set([...content.runtimeIntents, ...output.runtimeIntents])],
    }),
  );
}

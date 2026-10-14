import type { AuthoringContent } from '@thesis-ledger/schemas';

export function authoringSources(content: AuthoringContent) {
  return [
    content.description,
    ...content.questions
      .filter((question) => question.answerState === 'confirmed')
      .map((question) => question.answer!),
  ];
}

export function matchesAuthoringSource(sources: string[], quote: string) {
  return Boolean(quote.trim()) && sources.some((source) => source.includes(quote));
}

export function currentAuthoringQuestions(content: AuthoringContent, sources: string[]) {
  const questions = new Map(
    content.questions
      .filter(
        (question) =>
          matchesAuthoringSource(sources, question.quote) ||
          (!question.quote.trim() && question.answerState === 'confirmed'),
      )
      .map((question) => [question.id, question]),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, question] of questions) {
      if (question.dependsOn.some((dependency) => !questions.has(dependency))) {
        questions.delete(id);
        changed = true;
      }
    }
  }
  return questions;
}

export function currentAuthoringAnalysisContent(content: AuthoringContent) {
  const sources = authoringSources(content);
  return {
    ...content,
    requirements: content.requirements.filter(
      (item) => item.state === 'removed' || matchesAuthoringSource(sources, item.quote),
    ),
    questions: [...currentAuthoringQuestions(content, sources).values()],
  };
}

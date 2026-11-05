import type { ReactNode } from 'react';

export function ResearchQuestionSection({
  question,
  children,
}: {
  question: string;
  children?: ReactNode;
}) {
  return (
    <section aria-labelledby="research-question-title" className="flex flex-col gap-2">
      <h3 id="research-question-title" className="text-base font-semibold">
        研究问题与背景
      </h3>
      {question.length > 240 ? (
        <details>
          <summary className="cursor-pointer text-sm">展开完整研究问题</summary>
          <p className="mt-2 break-words whitespace-pre-wrap text-sm leading-6">{question}</p>
        </details>
      ) : (
        <p className="break-words whitespace-pre-wrap text-sm leading-6">{question}</p>
      )}
      {children}
    </section>
  );
}

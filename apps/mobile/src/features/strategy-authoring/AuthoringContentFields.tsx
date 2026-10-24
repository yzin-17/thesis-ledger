import { useState } from 'react';
import { authoringContentSchema, type AuthoringContent } from '@thesis-ledger/schemas';
import { Choices, Copy, Field, Section } from '../../components/MobilePrimitives';
import { AuthoringConfirmationFields } from './AuthoringConfirmationFields';
export function AuthoringContentFields({
  text,
  onChange,
  disabled,
}: {
  text: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const [view, setView] = useState('common');
  let content: AuthoringContent | null = null;
  try {
    content = authoringContentSchema.parse(JSON.parse(text));
  } catch {
    /* 保留不完整内容供高级编辑。 */
  }
  const change = (value: AuthoringContent) => onChange(JSON.stringify(value, null, 2));
  return (
    <>
      <Choices
        label="草稿编辑方式"
        value={view}
        onChange={setView}
        options={[
          { value: 'common', label: '需求与确认' },
          { value: 'advanced', label: '完整草稿 JSON' },
        ]}
      />
      {view === 'advanced' || !content ? (
        <Field
          label="完整编写草稿 JSON"
          value={text}
          multiline
          editable={!disabled}
          onChange={onChange}
        />
      ) : (
        <>
          <Field
            label="编写标题"
            value={content.title}
            editable={!disabled}
            onChange={(title) => change({ ...content, title })}
          />
          <Field
            label="策略需求"
            value={content.description}
            multiline
            editable={!disabled}
            onChange={(description) => change({ ...content, description })}
          />
          {content.questions.map((question, i) => (
            <Section key={question.id} title={question.quote}>
              <Copy>{question.reason}</Copy>
              <Copy>{question.options.join('；')}</Copy>
              <Field
                label={`问题 ${i + 1} 答案`}
                value={question.answer ?? ''}
                editable={!disabled}
                onChange={(answer) =>
                  change({
                    ...content,
                    questions: content.questions.map((q, n) =>
                      n === i ? { ...q, answer, answerState: 'needs_review' } : q,
                    ),
                  })
                }
              />
              <Choices
                label={`问题 ${i + 1} 确认`}
                value={question.answerState}
                disabled={disabled || !question.answer?.trim()}
                options={[
                  { value: 'needs_review', label: '待核对' },
                  { value: 'confirmed', label: '确认答案' },
                ]}
                onChange={(answerState) =>
                  change({
                    ...content,
                    questions: content.questions.map((q, n) =>
                      n === i ? { ...q, answerState } : q,
                    ),
                  })
                }
              />
            </Section>
          ))}
          {content.requirements.map((r) => (
            <Copy key={r.id}>
              需求：{r.quote} · {r.interpretation} ·{' '}
              {
                (
                  {
                    understood: '已理解',
                    unresolved: '待澄清',
                    unsupported: '不支持',
                    removed: '已移除',
                    runtime: '运行约束',
                  } as const
                )[r.state]
              }
            </Copy>
          ))}
          <AuthoringConfirmationFields content={content} disabled={disabled} onChange={change} />
          <Field
            label="草稿策略定义"
            value={content.definitionText}
            multiline
            editable={!disabled}
            onChange={(definitionText) => change({ ...content, definitionText })}
          />
          <Copy muted>完整草稿保留需求映射、运行约束及修改记录，可切换高级编辑查看。</Copy>
        </>
      )}
    </>
  );
}

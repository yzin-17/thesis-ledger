import type { AuthoringContent } from '@thesis-ledger/schemas';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { AuthoringSelect } from './AuthoringSelect.js';

const requirementLabels = {
  understood: '已理解',
  unresolved: '待审核',
  unsupported: '当前不支持',
  removed: '已明确移除',
  runtime: '回测时设置',
};
const answerLabels = { confirmed: '已确认', unanswered: '待回答', needs_review: '需重新审核' };
export function AuthoringClarification({
  content,
  onChange,
  disabled,
}: {
  content: AuthoringContent;
  onChange: (next: AuthoringContent) => void;
  disabled: boolean;
}) {
  const answer = (id: string, text: string, confirmed: boolean) =>
    onChange({
      ...content,
      questions: content.questions.map((question) =>
        question.id === id
          ? { ...question, answer: text, answerState: confirmed ? 'confirmed' : 'unanswered' }
          : question,
      ),
    });
  return (
    <div className="flex flex-col gap-4">
      {content.questions.map((question) => {
        const pendingDependency = question.dependsOn.some(
          (id) => content.questions.find((item) => item.id === id)?.answerState !== 'confirmed',
        );
        return (
          <Card key={question.id}>
            <CardHeader>
              <CardTitle>{question.reason || '请确认这项条件'}</CardTitle>
              <CardDescription>原句：{question.quote}</CardDescription>
              <Badge variant="outline">{answerLabels[question.answerState]}</Badge>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                {question.options.length > 0 && (
                  <Field>
                    <FieldLabel>建议选项</FieldLabel>
                    <AuthoringSelect
                      label={`选项：${question.reason}`}
                      value={question.answer ?? ''}
                      disabled={disabled || pendingDependency}
                      options={question.options.map((label) => ({ label, value: label }))}
                      onChange={(text) => answer(question.id, text, false)}
                    />
                  </Field>
                )}
                <Field>
                  <FieldLabel>你的明确答案</FieldLabel>
                  <Textarea
                    aria-label={`答案：${question.reason}`}
                    value={question.answer ?? ''}
                    disabled={disabled || pendingDependency}
                    onChange={(event) => answer(question.id, event.target.value, false)}
                    maxLength={2000}
                  />
                  {pendingDependency && (
                    <FieldDescription>请先确认上游问题；当前答案保留供重新审核。</FieldDescription>
                  )}
                </Field>
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled || pendingDependency || !question.answer?.trim()}
                  onClick={() => answer(question.id, question.answer!, true)}
                >
                  确认这个答案
                </Button>
              </FieldGroup>
            </CardContent>
          </Card>
        );
      })}
      <h3 className="text-lg font-semibold">需求覆盖清单</h3>
      {content.requirements.length === 0 && (
        <p className="text-sm text-muted-foreground">分析后逐项审核你的要求。</p>
      )}
      {content.requirements.map((requirement) => (
        <Card key={requirement.id}>
          <CardHeader>
            <CardTitle>{requirement.quote}</CardTitle>
            <Badge variant="outline">{requirementLabels[requirement.state]}</Badge>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel>对应原文</FieldLabel>
                <Textarea
                  aria-label={`对应原文：${requirement.id}`}
                  value={requirement.quote}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({
                      ...content,
                      requirements: content.requirements.map((item) =>
                        item.id === requirement.id
                          ? { ...item, quote: event.target.value, state: 'unresolved' }
                          : item,
                      ),
                    })
                  }
                  maxLength={2000}
                />
                <FieldDescription>
                  修正原文引用后需重新确认，不能遗漏描述中的句子。
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel>规则解释</FieldLabel>
                <Textarea
                  aria-label={`规则解释：${requirement.quote}`}
                  value={requirement.interpretation}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({
                      ...content,
                      requirements: content.requirements.map((item) =>
                        item.id === requirement.id
                          ? { ...item, interpretation: event.target.value, state: 'unresolved' }
                          : item,
                      ),
                    })
                  }
                  maxLength={2000}
                />
                {requirement.definitionPaths.length > 0 && (
                  <FieldDescription>
                    定义位置：{requirement.definitionPaths.join('、')}
                  </FieldDescription>
                )}
              </Field>
              <div className="flex flex-wrap gap-2">
                {requirement.state !== 'unsupported' && requirement.state !== 'removed' && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    onClick={() =>
                      onChange({
                        ...content,
                        requirements: content.requirements.map((item) =>
                          item.id === requirement.id ? { ...item, state: 'understood' } : item,
                        ),
                      })
                    }
                  >
                    确认已表达
                  </Button>
                )}
                {requirement.state !== 'removed' && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    onClick={() =>
                      onChange({
                        ...content,
                        requirements: content.requirements.map((item) =>
                          item.id === requirement.id ? { ...item, state: 'removed' } : item,
                        ),
                        removedRequirements: [
                          ...new Set([...content.removedRequirements, requirement.quote]),
                        ],
                      })
                    }
                  >
                    明确移除此要求
                  </Button>
                )}
                {requirement.state === 'unsupported' && (
                  <p className="text-xs text-muted-foreground">
                    请改写原描述并重新分析，或明确移除；不会自动替换为另一规则。
                  </p>
                )}
              </div>
            </FieldGroup>
          </CardContent>
        </Card>
      ))}
      {content.runtimeIntents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>回测时再次确认</CardTitle>
            <CardDescription>保存策略后由你主动开始回测。</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-5">
              {content.runtimeIntents.map((intent, index) => (
                <li key={index}>{intent}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {content.removedRequirements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>已移除的原始要求</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-5">
              {content.removedRequirements.map((quote, index) => (
                <li key={index}>{quote}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

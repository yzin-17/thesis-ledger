import type { ResearchSubmissionV2 } from '@thesis-ledger/schemas';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Textarea } from '@/components/ui/textarea';
import { ResearchInstrumentPicker } from './ResearchInstrumentPicker.js';
import { researchQuestionTemplates } from './ai.templates.js';
import { researchScopeLabels as scopeLabels, type ResearchDraft } from './use-research-draft.js';
import type { useResearchDraftObjects } from './research-draft-objects.js';
function objectSelectHint(loading: boolean, failed: boolean, count: number) {
  if (loading) return '正在读取…';
  if (failed) return '读取失败，请稍后重试。';
  if (!count) return '当前没有可选对象。';
  return '请选择本次研究的实际对象。';
}
type Scope = ResearchSubmissionV2['scope']['scope'];
function ObjectSelect({
  label,
  value,
  items,
  loading,
  failed,
  onChange,
}: {
  label: string;
  value: string | null;
  items: Array<{ value: string; label: string }>;
  loading: boolean;
  failed: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select
        items={items}
        value={value ?? ''}
        onValueChange={(next) => onChange(next || null)}
        disabled={loading || failed}
      >
        <SelectTrigger className="w-full" aria-label={label}>
          <SelectValue placeholder={`选择${label}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldDescription>{objectSelectHint(loading, failed, items.length)}</FieldDescription>
    </Field>
  );
}
export function ResearchDraftFields({
  draft,
  onChange,
  objects,
  allowedScopes,
}: {
  draft: ResearchDraft;
  onChange: (patch: Partial<ResearchDraft>) => void;
  objects: ReturnType<typeof useResearchDraftObjects>;
  allowedScopes: Scope[];
}) {
  const { scope, instrument, symbol, strategyVersionId, question, templateId } = draft;
  const setInstrument = (instrument: ResearchDraft['instrument']) => onChange({ instrument });
  const setAccountId = (accountId: string | null) => onChange({ accountId });
  const setSymbol = (symbol: string | null) => onChange({ symbol });
  const setStrategyVersionId = (strategyVersionId: string | null) =>
    onChange({ strategyVersionId });
  const setQuestion = (question: string) => onChange({ question });
  const setTemplateId = (templateId: ResearchDraft['templateId']) => onChange({ templateId });
  const selectScope = (values: string[]) => {
    const scope = values[0] as Scope | undefined;
    if (scope)
      onChange({ scope, instrument: null, accountId: null, symbol: null, strategyVersionId: null });
  };
  return (
    <FieldGroup>
      <Field>
        <FieldLabel>研究范围</FieldLabel>
        <ToggleGroup
          value={[scope]}
          onValueChange={selectScope}
          aria-label="选择研究范围"
          className="grid grid-cols-2 sm:grid-cols-3"
        >
          {allowedScopes.map((value) => (
            <ToggleGroupItem key={value} value={value}>
              {scopeLabels[value]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      {scope === 'instrument' && (
        <ResearchInstrumentPicker value={instrument} onChange={setInstrument} />
      )}
      {(scope === 'account' || scope === 'position') && (
        <ObjectSelect
          label="研究账户"
          value={objects.effectiveAccountId}
          items={objects.accountOptions}
          loading={objects.accounts.isPending}
          failed={objects.accounts.isError}
          onChange={(value) => {
            setAccountId(value);
            setSymbol(null);
          }}
        />
      )}
      {scope === 'position' && objects.effectiveAccountId && (
        <ObjectSelect
          label="研究持仓"
          value={symbol}
          items={objects.positionOptions}
          loading={objects.positions.isPending}
          failed={objects.positions.isError}
          onChange={setSymbol}
        />
      )}
      {scope === 'strategy' && (
        <ObjectSelect
          label="策略版本"
          value={strategyVersionId}
          items={objects.strategyOptions}
          loading={objects.strategies.isPending}
          failed={objects.strategies.isError}
          onChange={setStrategyVersionId}
        />
      )}
      <Field>
        <FieldLabel htmlFor="research-v2-question">研究问题</FieldLabel>
        <Textarea
          id="research-v2-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={6}
          maxLength={2000}
          placeholder="需要回答什么问题？"
        />
        <FieldDescription>
          {question.length}/2000。报告保留材料、推理依据、风险和未知项。
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel>常用问题</FieldLabel>
        <ToggleGroup
          value={templateId ? [templateId] : []}
          aria-label="常用研究问题"
          onValueChange={(values) => {
            const template = researchQuestionTemplates.find((item) => item.id === values[0]);
            if (template) {
              setTemplateId(template.id);
              setQuestion(template.question);
            }
          }}
        >
          {researchQuestionTemplates.map((template) => (
            <ToggleGroupItem key={template.id} value={template.id}>
              {template.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <FieldDescription>选择后仍可编辑，不会自动提交。</FieldDescription>
      </Field>
    </FieldGroup>
  );
}

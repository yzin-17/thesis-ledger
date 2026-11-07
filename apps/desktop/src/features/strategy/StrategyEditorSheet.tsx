import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigationGuard } from '../shared/navigation-guard.js';
import { LoaderCircle } from 'lucide-react';
import { strategySchema } from '@thesis-ledger/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { schemaFromVersion, schemaName } from './strategy.schema.js';
import { hasUnappliedJson, shouldApplyAdvancedJson } from './strategy.formats.js';
import { StrategyConfigurationFields } from './StrategyConfigurationFields.js';
import type { StrategyRecord, StrategySchema, StrategyVersion } from './strategy.types.js';

type EditorMode = 'create' | 'edit';

const parseJson = (value: string): StrategySchema | null => {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as StrategySchema)
      : null;
  } catch {
    return null;
  }
};

export function StrategyEditorSheet({
  open,
  mode,
  strategy,
  version,
  busy,
  errorMessage,
  presentation = 'sheet',
  triggerId,
  onOpenChange,
  onDirtyChange,
  bypassNavigation,
  onSave,
}: {
  open: boolean;
  mode: EditorMode;
  strategy?: StrategyRecord | null;
  version?: StrategyVersion | null;
  busy: boolean;
  errorMessage?: string | null;
  presentation?: 'sheet' | 'page';
  triggerId?: string | undefined;
  onOpenChange: (open: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  bypassNavigation?: () => boolean;
  onSave: (schema: StrategySchema) => void;
}) {
  const initialSchema = useMemo(
    () => schemaFromVersion(mode === 'edit' ? (version ?? null) : null, strategy?.name),
    [mode, strategy?.name, version],
  );
  const [draft, setDraft] = useState<StrategySchema>(initialSchema);
  const [jsonText, setJsonText] = useState(() => JSON.stringify(initialSchema, null, 2));
  const [activeTab, setActiveTab] = useState('common');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const initializedSource = useRef<string | null>(null);
  const sourceKey = `${mode}:${strategy?.id ?? ''}:${version?.id ?? ''}`;

  useEffect(() => {
    if (!open) {
      initializedSource.current = null;
      return;
    }
    if (initializedSource.current === sourceKey) return;
    initializedSource.current = sourceKey;
    setDraft(initialSchema);
    setJsonText(JSON.stringify(initialSchema, null, 2));
    setActiveTab('common');
    setJsonError(null);
    setSchemaError(null);
  }, [initialSchema, open, sourceKey]);

  useEffect(() => {
    if (activeTab === 'advanced') setJsonText(JSON.stringify(draft, null, 2));
  }, [activeTab, draft]);

  const updateDraft = (next: StrategySchema) => {
    setDraft(next);
    setSchemaError(null);
  };
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(initialSchema) ||
    (activeTab === 'advanced' && hasUnappliedJson(jsonText, draft));
  useNavigationGuard({
    dirty: open && dirty,
    busy: open && busy,
    bypass: () => bypassNavigation?.() ?? false,
    draft: { sourceKey, draft, jsonText: activeTab === 'advanced' ? jsonText : undefined },
  });

  useEffect(() => {
    onDirtyChange?.(open && dirty);
  }, [dirty, onDirtyChange, open]);

  const validateJson = () => {
    const parsed = parseJson(jsonText);
    if (!parsed) {
      setJsonError('JSON 格式无效，请检查括号、逗号和字符串引号。');
      return null;
    }
    const validated = strategySchema.safeParse(parsed);
    if (!validated.success) {
      const issue = validated.error.issues[0];
      setJsonError(`${issue?.path.join('.') || '配置'}：${issue?.message ?? '策略配置校验失败'}`);
      return null;
    }
    return validated.data;
  };

  const applyJson = () => {
    const next = validateJson();
    if (!next) return false;
    updateDraft(next);
    setJsonText(JSON.stringify(next, null, 2));
    setJsonError(null);
    return true;
  };

  const handleTabChange = (nextTab: string) => {
    if (shouldApplyAdvancedJson(activeTab, nextTab, jsonText, draft) && !applyJson()) return;
    setActiveTab(nextTab);
  };

  const handleSheetOpenChange = (nextOpen: boolean) => {
    if (busy) return;
    if (!nextOpen && dirty) {
      setConfirmCloseOpen(true);
      return;
    }
    onOpenChange(nextOpen);
  };

  const submit = () => {
    if (busy) return;
    const candidate = activeTab === 'advanced' ? validateJson() : draft;
    if (!candidate) return;
    const validated = strategySchema.safeParse(candidate);
    if (!validated.success) {
      const issue = validated.error.issues[0];
      setSchemaError(`${issue?.path.join('.') || '配置'}：${issue?.message ?? '策略配置校验失败'}`);
      return;
    }
    onSave(validated.data);
  };

  let saveButtonLabel = '保存为新版本';
  if (busy) saveButtonLabel = '保存中…';
  else if (mode === 'create') saveButtonLabel = '创建策略';

  const editorTitle = mode === 'create' ? '新建策略' : (strategy?.name ?? '编辑策略');
  const editorDescription =
    mode === 'create'
      ? '保存后可从策略库选择版本进行回测。'
      : `基于 v${version?.version ?? '?'} 编辑，保存为新版本；保留原版本和历史回测。`;
  const editorHeader = presentation === 'sheet' && (
    <SheetHeader>
      <SheetTitle className="wrap-anywhere">{editorTitle}</SheetTitle>
      <SheetDescription id="strategy-editor-description">{editorDescription}</SheetDescription>
    </SheetHeader>
  );

  const editorContent = (
    <>
      {editorHeader}
      <SheetBody>
        {errorMessage ? (
          <Alert variant="destructive" className="mb-group">
            <AlertTitle>保存失败</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList variant="line" className="w-full">
            <TabsTrigger value="common">常用配置</TabsTrigger>
            <TabsTrigger value="advanced">高级 JSON</TabsTrigger>
          </TabsList>
          <TabsContent value="common">
            <FieldGroup className="gap-6">
              {mode === 'create' && (
                <Field invalid={Boolean(schemaError?.startsWith('name'))}>
                  <FieldLabel htmlFor="strategy-name">策略名称</FieldLabel>
                  <Input
                    id="strategy-name"
                    value={schemaName(draft, strategy?.name ?? '')}
                    onChange={(event) => updateDraft({ ...draft, name: event.target.value })}
                    placeholder="例如：均线突破"
                  />
                  {schemaError?.startsWith('name') && <FieldError>{schemaError}</FieldError>}
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="strategy-description">策略说明</FieldLabel>
                <Textarea
                  id="strategy-description"
                  value={typeof draft.description === 'string' ? draft.description : ''}
                  onChange={(event) => updateDraft({ ...draft, description: event.target.value })}
                  rows={3}
                  placeholder="记录这条策略的假设和适用范围"
                />
              </Field>
              <StrategyConfigurationFields schema={draft} onChange={updateDraft} />
            </FieldGroup>
          </TabsContent>
          <TabsContent value="advanced">
            <Field invalid={Boolean(jsonError)}>
              <FieldLabel htmlFor="strategy-json">策略配置 JSON</FieldLabel>
              <Textarea
                id="strategy-json"
                value={jsonText}
                onChange={(event) => {
                  setJsonText(event.target.value);
                  setJsonError(null);
                }}
                rows={24}
                className="font-mono text-xs"
              />
              <FieldDescription>
                信号表达式、来源和风险规则可在 JSON 中编辑。点击“应用 JSON”后同步到常用配置。
              </FieldDescription>
              {jsonError && <FieldError>{jsonError}</FieldError>}
              <Button type="button" variant="outline" className="self-start" onClick={applyJson}>
                应用 JSON
              </Button>
            </Field>
          </TabsContent>
        </Tabs>
        {schemaError && (mode === 'edit' || !schemaError.startsWith('name')) && (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {schemaError}
          </p>
        )}
      </SheetBody>
      <SheetFooter>
        <Button type="button" variant="outline" onClick={() => handleSheetOpenChange(false)}>
          取消
        </Button>
        <Button type="button" disabled={busy} onClick={submit}>
          {busy && (
            <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
          )}
          {saveButtonLabel}
        </Button>
      </SheetFooter>
    </>
  );

  return (
    <>
      {presentation === 'page' ? (
        <div className="flex min-w-0 flex-col gap-5">{editorContent}</div>
      ) : (
        <Sheet open={open} triggerId={triggerId} onOpenChange={handleSheetOpenChange}>
          <SheetContent
            side="right"
            size="form"
            className="overflow-hidden"
            aria-describedby="strategy-editor-description"
            finalFocus={triggerId ? () => document.getElementById(triggerId) : undefined}
          >
            {editorContent}
          </SheetContent>
        </Sheet>
      )}
      <AlertDialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle>
            <AlertDialogDescription>关闭后，本次修改将丢失。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmCloseOpen(false)}>
              继续编辑
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setConfirmCloseOpen(false);
                onOpenChange(false);
              }}
            >
              放弃修改并关闭
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

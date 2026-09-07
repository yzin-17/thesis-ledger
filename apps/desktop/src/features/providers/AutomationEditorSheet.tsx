import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch, SwitchThumb } from '@/components/ui/switch';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoaderCircle } from 'lucide-react';
import { automationJobTypes } from '@thesis-ledger/schemas';

import {
  AUTOMATION_SCHEDULE_CUSTOM,
  automationJobTypeLabel,
  automationScheduleLabel,
  automationSchedulePresets,
} from './providers.types.js';
import type { AutomationJob, AutomationJobDraft } from './providers.types.js';

const managedValuationTypes = new Set([
  'valuation-intraday-sample',
  'snapshot-close-estimate',
  'snapshot-official-reconcile',
]);

const submitLabel = (saving: boolean, editing: boolean) => {
  if (saving) return '保存中…';
  return editing ? '保存修改' : '创建任务';
};

/** 创建时名称默认跟随类型中文名；用户改过名称或编辑模式下不再跟随。 */
const applyTypeChange = (
  current: AutomationJobDraft,
  value: string,
  editing: boolean,
): AutomationJobDraft => {
  if (current.type === value) return current;
  const nameFollowsType = !editing && current.name === automationJobTypeLabel(current.type);
  return {
    ...current,
    type: value,
    name: nameFollowsType ? automationJobTypeLabel(value) : current.name,
  };
};

export const AutomationEditorSheet = ({
  open,
  editingJob,
  draft,
  saving,
  onOpenChange,
  onUpdateDraft,
  onClose,
  onSubmit,
}: {
  open: boolean;
  editingJob: AutomationJob | null;
  draft: AutomationJobDraft;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateDraft: (updater: (current: AutomationJobDraft) => AutomationJobDraft) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) => {
  const customCron = draft.schedulePreset === AUTOMATION_SCHEDULE_CUSTOM;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        aria-describedby="automation-form-description"
        className="h-[100dvh] min-h-0 w-[520px] max-w-[calc(100%-16px)] overflow-hidden p-6 sm:max-w-[calc(100%-16px)]"
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
          <div className="shrink-0">
            <SheetTitle>{editingJob ? '编辑自动化任务' : '新建自动化任务'}</SheetTitle>
            <SheetDescription id="automation-form-description">
              任务类型创建后不可修改；有运行历史的任务无法删除，可改用停用。
            </SheetDescription>
          </div>
          <form
            key={editingJob?.id ?? 'new-automation-job'}
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-4"
            onSubmit={onSubmit}
          >
            <div className="-mx-1 -my-1 min-h-0 flex-1 overflow-y-auto px-1 py-1">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="automation-job-type">任务类型</FieldLabel>
                  <Select
                    value={draft.type}
                    disabled={Boolean(editingJob)}
                    onValueChange={(value) =>
                      value &&
                      onUpdateDraft((current) =>
                        applyTypeChange(current, value, Boolean(editingJob)),
                      )
                    }
                  >
                    <SelectTrigger id="automation-job-type" className="w-full">
                      <SelectValue>{automationJobTypeLabel(draft.type)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {automationJobTypes
                          .filter((type) => Boolean(editingJob) || !managedValuationTypes.has(type))
                          .map((type) => (
                            <SelectItem key={type} value={type}>
                              {automationJobTypeLabel(type)}
                            </SelectItem>
                          ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="automation-job-name">名称</FieldLabel>
                  <Input
                    id="automation-job-name"
                    value={draft.name}
                    disabled={editingJob?.managed === true}
                    onChange={(event) =>
                      onUpdateDraft((current) => ({ ...current, name: event.target.value }))
                    }
                    required
                    maxLength={80}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="automation-job-schedule">执行时间</FieldLabel>
                  <Select
                    value={draft.schedulePreset}
                    onValueChange={(value) =>
                      value &&
                      onUpdateDraft((current) => ({
                        ...current,
                        schedulePreset: value,
                        cron: value === AUTOMATION_SCHEDULE_CUSTOM ? current.cron : value,
                      }))
                    }
                  >
                    <SelectTrigger id="automation-job-schedule" className="w-full">
                      <SelectValue>{automationScheduleLabel(draft.schedulePreset)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {automationSchedulePresets.map((preset) => (
                          <SelectItem key={preset.value} value={preset.value}>
                            {preset.label}
                          </SelectItem>
                        ))}
                        <SelectItem value={AUTOMATION_SCHEDULE_CUSTOM}>自定义</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                {customCron && (
                  <Field>
                    <FieldLabel htmlFor="automation-job-cron">Cron 表达式</FieldLabel>
                    <Input
                      id="automation-job-cron"
                      value={draft.cron}
                      onChange={(event) =>
                        onUpdateDraft((current) => ({ ...current, cron: event.target.value }))
                      }
                      placeholder="分 时 日 月 周，例如 0 16 * * 1-5"
                      required
                      minLength={5}
                    />
                  </Field>
                )}
                <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
                  <div>
                    <p className="m-0 text-sm font-medium">启用任务</p>
                    <p className="field-hint">停用后不再按计划自动执行，可随时重新启用。</p>
                  </div>
                  <Switch
                    variant="risk"
                    aria-label="启用任务"
                    checked={draft.enabled}
                    onCheckedChange={(checked) =>
                      onUpdateDraft((current) => ({ ...current, enabled: checked }))
                    }
                  >
                    <SwitchThumb variant="risk" aria-hidden="true" />
                  </Switch>
                </div>
              </FieldGroup>
            </div>
            <SheetFooter className="shrink-0 flex-row justify-end border-t border-border p-0 pt-4">
              <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
                取消
              </Button>
              <Button disabled={saving} aria-busy={saving} type="submit">
                {saving && (
                  <LoaderCircle
                    data-icon="inline-start"
                    className="animate-spin"
                    aria-hidden="true"
                  />
                )}
                {submitLabel(saving, Boolean(editingJob))}
              </Button>
            </SheetFooter>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
};

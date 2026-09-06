import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch, SwitchThumb } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
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
        className="h-[100dvh] w-[560px] max-w-[calc(100%-16px)] overflow-auto p-6 sm:max-w-[calc(100%-16px)]"
      >
        <div className="panel-heading">
          <SheetTitle>{editingJob ? '编辑自动化任务' : '新建自动化任务'}</SheetTitle>
          <SheetDescription id="automation-form-description">
            任务类型创建后不可修改；有运行历史的任务无法删除，可改用停用。
          </SheetDescription>
        </div>
        <form
          key={editingJob?.id ?? 'new-automation-job'}
          className="form-card min-h-0 w-full max-w-none content-start overflow-auto"
          onSubmit={onSubmit}
        >
          <div className="grid gap-1.5 text-xs text-muted-foreground">
            <span>任务类型</span>
            <Select
              value={draft.type}
              disabled={Boolean(editingJob)}
              onValueChange={(value) =>
                value && onUpdateDraft((current) => applyTypeChange(current, value, Boolean(editingJob)))
              }
            >
              <SelectTrigger aria-label="任务类型" className="w-full">
                <SelectValue>{automationJobTypeLabel(draft.type)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {automationJobTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {automationJobTypeLabel(type)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5 text-xs text-muted-foreground">
            <span>名称</span>
            <Input
              aria-label="任务名称"
              value={draft.name}
              onChange={(event) =>
                onUpdateDraft((current) => ({ ...current, name: event.target.value }))
              }
              required
              maxLength={80}
            />
          </div>
          <div className="grid gap-1.5 text-xs text-muted-foreground">
            <span>执行时间</span>
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
              <SelectTrigger aria-label="执行时间" className="w-full">
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
          </div>
          {customCron && (
            <div className="grid gap-1.5 text-xs text-muted-foreground">
              <span>Cron 表达式</span>
              <Input
                aria-label="Cron 表达式"
                value={draft.cron}
                onChange={(event) =>
                  onUpdateDraft((current) => ({ ...current, cron: event.target.value }))
                }
                placeholder="分 时 日 月 周，例如 0 16 * * 1-5"
                required
                minLength={5}
              />
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">启用</span>
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
          <div className="form-actions">
            <Button
              className="secondary"
              type="button"
              variant="outline"
              disabled={saving}
              onClick={onClose}
            >
              取消
            </Button>
            <Button disabled={saving} aria-busy={saving} type="submit" variant="default">
              {saving && (
                <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
              )}
              {submitLabel(saving, Boolean(editingJob))}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
};

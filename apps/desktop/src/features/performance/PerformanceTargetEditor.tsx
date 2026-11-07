import { createClientRequestId } from '../../lib/client-request-id';
import { useState } from 'react';
import { Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { allocationWeightFromPercent, formatRatioPercent, normalizeAllocationCategory } from '@thesis-ledger/domain';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { InputGroup, InputGroupAddon } from '@/components/ui/input-group';
import { DecimalInput } from '@/components/ui/decimal-input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDraftCloseGuard } from '../shared/useDraftCloseGuard.js';
import { PerformanceTargetActions } from './PerformanceTargetActions.js';
import { CATEGORY_LABELS, CATEGORY_ORDER, rowsFromTargets, validateTargetDraft, type TargetRow } from './performance.target-draft.js';
import type { AllocationCategory } from './performance.types.js';
type Props = {
  label: string;
  scopeLabel: string;
  categories: { category: AllocationCategory; currentWeight: number | null }[];
  targets: Record<string, number>;
  saving: boolean;
  disabled: boolean;
  error?: string | null | undefined;
  onBeginEdit?: (() => void) | undefined;
  onSave: (targets: Record<AllocationCategory, number>) => Promise<boolean>;
};

export function PerformanceTargetEditor({ label, scopeLabel, categories, targets, saving, disabled, error, onBeginEdit, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<TargetRow[]>([]);
  const requestClose = useDraftCloseGuard({ open, draft: { scopeLabel, rows: draft }, busy: saving, onOpenChange: setOpen });
  const validation = validateTargetDraft(draft);
  let totalText = '超出范围';
  if (Number.isFinite(validation.total)) {
    let percentText = validation.total.toFixed(2);
    if (!validation.totalValid && percentText === '100.00') {
      percentText = validation.total.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
    }
    totalText = `${percentText}%`;
  }
  const available = CATEGORY_ORDER.filter(category => !draft.some(row => normalizeAllocationCategory(row.category) === category));

  function changeOpen(next: boolean) {
    if (!next) { void requestClose(false); return; }
    onBeginEdit?.();
    const existing = rowsFromTargets(targets);
    const held = categories.filter(({ category }) => !existing.some(row => row.category === category));
    setDraft([...existing, ...held.map(({ category }) => ({ id: category, category, percent: null }))]);
    setOpen(true);
  }

  function update(id: string, patch: Partial<TargetRow>) {
    setDraft(current => current.map(row => row.id === id ? { ...row, ...patch } : row));
  }

  async function save() {
    if (saving || disabled || !validation.valid) return;
    const targets = {} as Record<AllocationCategory, number>;
    for (const row of draft) {
      const category = normalizeAllocationCategory(row.category);
      const weight = row.percent === null ? null : allocationWeightFromPercent(row.percent);
      if (category && weight !== null) targets[category] = weight;
    }
    if (await onSave(targets)) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger disabled={saving || disabled} render={<Button variant="outline" size="sm" />}>
        <SlidersHorizontal data-icon="inline-start" />{label}
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b p-5 pr-12">
          <DialogTitle className="text-xl font-semibold">设置配置目标</DialogTitle>
          <DialogDescription>{scopeLabel} · 目标权重须合计 100%。</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_2rem] items-center gap-x-2 border-b pb-2 text-xs text-muted-foreground">
            <span>资产分类</span><span className="text-right">目标权重</span>
          </div>
          {draft.map(row => {
            const category = normalizeAllocationCategory(row.category);
            const name = category ? CATEGORY_LABELS[category] : row.category || '旧分类';
            const weight = categories.find(item => item.category === category)?.currentWeight;
            return (
              <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_6.5rem_2rem] items-center gap-x-2 border-b py-3">
                {category ? (
                  <div className="grid min-w-0 gap-1">
                    <span className="font-medium">{name}</span>
                    {weight != null && <span className="text-xs tabular-nums text-muted-foreground">当前 {formatRatioPercent(weight)}</span>}
                  </div>
                ) : (
                  <Select value={null} disabled={saving} onValueChange={value => value && update(row.id, { category: value })}>
                    <SelectTrigger aria-label="重新选择旧分类"><SelectValue placeholder={name} /></SelectTrigger>
                    <SelectContent><SelectGroup>{available.map(option => (
                      <SelectItem key={option} value={option}>{CATEGORY_LABELS[option]}</SelectItem>
                    ))}</SelectGroup></SelectContent>
                  </Select>
                )}
                <InputGroup>
                  <DecimalInput grouped fractionDigits={4} disabled={saving}
                    className="text-right tabular-nums" aria-label={`${name}目标权重百分比`} placeholder="未填写"
                    value={row.percent ?? ''} onChange={event => update(row.id, { percent: event.target.value === '' ? null : event.target.value })} />
                  <InputGroupAddon align="inline-end">%</InputGroupAddon>
                </InputGroup>
                <Button variant="ghost" size="icon-sm" aria-label={`移除${name}目标`} title={`移除${name}目标`}
                  className="text-muted-foreground hover:text-destructive" disabled={saving}
                  onClick={() => setDraft(current => current.filter(item => item.id !== row.id))}><Trash2 /></Button>
              </div>
            );
          })}
          <DropdownMenu>
            <DropdownMenuTrigger disabled={saving || !available.length} render={<Button variant="ghost" size="sm" className="mt-2" />}>
              <Plus data-icon="inline-start" />新增分类
            </DropdownMenuTrigger>
            <DropdownMenuContent>{available.map(category => (
              <DropdownMenuItem key={category} onClick={() => setDraft(current => [...current, { id: createClientRequestId(), category, percent: null }])}>
                {CATEGORY_LABELS[category]}
              </DropdownMenuItem>
            ))}</DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="grid shrink-0 gap-2 border-t bg-muted/30 px-5 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium">目标合计</span>
            <strong className="text-lg tabular-nums">{totalText}</strong>
          </div>
          {validation.total > 0 && draft.some(row => row.percent === null) && (
            <p className="text-xs text-muted-foreground">请填写剩余分类的权重，或移除该分类。</p>
          )}
          {!validation.invalidNumber && validation.total < 100 && !validation.totalValid && <p className="text-xs text-destructive">合计不足 100%，请增加目标权重。</p>}
          {validation.total > 100 && !validation.totalValid && <p className="text-xs text-destructive">合计超过 100%，请减少目标权重。</p>}
          {validation.invalidValue && <p className="text-xs text-destructive">目标权重须为 0～100% 的有效数字。</p>}
          {validation.duplicate && <p className="text-xs text-destructive">分类不能重复。</p>}
          {validation.unknown && <p className="text-xs text-destructive">存在未知旧分类，请重新选择。</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter className="flex-row justify-end border-t px-5 py-3">
          <PerformanceTargetActions saving={saving} valid={validation.valid && !disabled} onCancel={() => void requestClose(false)} onSave={() => void save()} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

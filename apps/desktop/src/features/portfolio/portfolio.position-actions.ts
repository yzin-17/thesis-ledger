import type { FormEvent } from 'react';

import type { SavePositionInput } from './portfolio.api.js';
import type { PortfolioActionDependencies, PortfolioToastManager } from './portfolio.actions.js';
import type { HeldAssetType, InstrumentLookup, Position } from './portfolio.types.js';
import { formText } from '../shared/display.js';

const positionSuccessTitle = (isCash: boolean, isEditing: boolean) => {
  if (isCash) return '现金余额已保存';
  if (isEditing) return '持仓已更新';
  return '持仓已添加';
};

const positionFailureTitle = (isCash: boolean, isEditing: boolean) => {
  if (isCash) return '现金余额保存失败';
  if (isEditing) return '持仓更新失败';
  return '持仓添加失败';
};

const validatePositionEntry = ({
  form,
  isCash,
  isEditing,
  selectedInstrument,
  manualInstrumentEntry,
  toastManager,
}: {
  form: FormData;
  isCash: boolean;
  isEditing: boolean;
  selectedInstrument: InstrumentLookup | null;
  manualInstrumentEntry: boolean;
  toastManager: PortfolioToastManager;
}) => {
  if (isCash || isEditing || selectedInstrument) return true;
  if (!manualInstrumentEntry) {
    toastManager.add({
      title: '请选择标的',
      description: '请从搜索结果中选择标的，或在未找到时手动录入。',
      type: 'error',
      timeout: 0,
      priority: 'high',
    });
    return false;
  }
  if (!formText(form, 'assetName').trim() || !formText(form, 'assetType')) {
    toastManager.add({
      title: '请补充标的信息',
      description: '手动录入需要填写名称和类型。',
      type: 'error',
      timeout: 0,
      priority: 'high',
    });
    return false;
  }
  return true;
};

const buildPositionInput = ({
  form,
  accountId,
  selectedInstrument,
  manualAssetType,
}: {
  form: FormData;
  accountId: string;
  selectedInstrument: InstrumentLookup | null;
  manualAssetType: HeldAssetType;
}): SavePositionInput => {
  const typedAsset = formText(form, 'assetType');
  let assetType: HeldAssetType | undefined;
  if (typedAsset) assetType = typedAsset as HeldAssetType;
  else if (selectedInstrument?.instrumentType === 'MUTUAL_FUND') assetType = 'fund';
  else if (selectedInstrument?.instrumentType === 'ETF') assetType = 'etf';
  else if (selectedInstrument) assetType = manualAssetType;
  const assetName = formText(form, 'assetName') || selectedInstrument?.displayName;
  return {
    accountId,
    symbol: formText(form, 'symbol').trim().toUpperCase(),
    quantity: Number(formText(form, 'quantity')),
    costPrice: Number(formText(form, 'costPrice')),
    source: 'manual',
    ...(selectedInstrument ? { instrumentId: selectedInstrument.id } : {}),
    ...(assetName ? { assetName } : {}),
    ...(assetType ? { assetType } : {}),
  };
};

const createPositionSubmitHandler = (dependencies: PortfolioActionDependencies) => {
  const {
    accounts,
    busyAction,
    editing,
    entryAccountId,
    selectedInstrument,
    manualInstrumentEntry,
    manualAssetType,
    mutations,
    setBusyAction,
    setEditing,
    setPositionSheetOpen,
    markDirty,
    onSaved,
    toastManager,
  } = dependencies;

  return async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyAction) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const accountId = formText(form, 'accountId') || entryAccountId;
    const account = accounts.find((item) => item.id === accountId);
    const isCash = account?.type === 'cash';
    const isEditing = Boolean(editing);
    const isValid = validatePositionEntry({
      form,
      isCash,
      isEditing,
      selectedInstrument,
      manualInstrumentEntry,
      toastManager,
    });
    if (!isValid) return;
    setBusyAction(isCash ? 'cash-save' : 'position-save');
    try {
      if (isCash) {
        await mutations.saveCash.mutateAsync({
          accountId,
          amount: Number(formText(form, 'cashAmount')),
        });
      } else {
        await mutations.savePosition.mutateAsync({
          ...(editing?.id ? { positionId: editing.id } : {}),
          input: buildPositionInput({ form, accountId, selectedInstrument, manualAssetType }),
        });
      }
      formElement.reset();
      setEditing(null);
      markDirty(false);
      setPositionSheetOpen(false);
      onSaved();
      toastManager.add({
        title: positionSuccessTitle(isCash, isEditing),
        description: isCash ? undefined : '组合将重新估值。',
        type: 'success',
        timeout: 2800,
      });
    } catch {
      toastManager.add({
        title: positionFailureTitle(isCash, isEditing),
        description: isCash ? '请检查金额。' : '请检查标的、数量和平均成本。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };
};

const createCashSubmitHandler = (dependencies: PortfolioActionDependencies) => {
  const {
    busyAction,
    entryAccountId,
    mutations,
    setBusyAction,
    setPositionSheetOpen,
    markDirty,
    onSaved,
    toastManager,
  } = dependencies;
  return async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyAction) return;
    const form = new FormData(event.currentTarget);
    setBusyAction('cash-save');
    try {
      await mutations.saveCash.mutateAsync({
        accountId: entryAccountId,
        amount: Number(formText(form, 'cashAmount')),
      });
      event.currentTarget.reset();
      markDirty(false);
      setPositionSheetOpen(false);
      onSaved();
      toastManager.add({ title: '现金余额已保存', type: 'success', timeout: 2800 });
    } catch {
      toastManager.add({
        title: '现金余额保存失败',
        description: '请检查金额。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };
};

const createClearPositionsHandler = (dependencies: PortfolioActionDependencies) => {
  const {
    entryAccountId,
    positions,
    busyAction,
    mutations,
    setBusyAction,
    markDirty,
    onSaved,
    toastManager,
  } = dependencies;
  return async () => {
    if (!entryAccountId || positions.length === 0 || busyAction) return;
    if (
      !window.confirm('确认清空当前账户的全部持仓？该操作会写入归零 Adjustment，现金余额不受影响。')
    )
      return;
    setBusyAction('clear-positions');
    try {
      await mutations.clearPositions.mutateAsync(entryAccountId);
      markDirty(false);
      onSaved();
      toastManager.add({ title: '持仓已清空', type: 'success', timeout: 2800 });
    } catch {
      toastManager.add({
        title: '清空持仓失败',
        description: '请稍后重试。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };
};

const createRemovePositionHandler = (dependencies: PortfolioActionDependencies) => {
  const { busyAction, mutations, setBusyAction, markDirty, onSaved, toastManager } = dependencies;
  return async (position: Position) => {
    if (busyAction) return;
    if (!window.confirm(`确认删除 ${position.asset.name}（${position.symbol}）？`)) return;
    setBusyAction(`remove:${position.id}`);
    try {
      await mutations.removePosition.mutateAsync(position.id);
      markDirty(false);
      onSaved();
      toastManager.add({ title: '持仓已删除', type: 'success', timeout: 2800 });
    } catch {
      toastManager.add({
        title: '持仓删除失败',
        description: '请稍后重试。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };
};

export const createPositionActionHandlers = (dependencies: PortfolioActionDependencies) => ({
  submitPosition: createPositionSubmitHandler(dependencies),
  submitCashBalance: createCashSubmitHandler(dependencies),
  clearPositions: createClearPositionsHandler(dependencies),
  remove: createRemovePositionHandler(dependencies),
});

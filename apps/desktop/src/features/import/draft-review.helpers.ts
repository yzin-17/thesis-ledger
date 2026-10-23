import { reviewedDraftCommand as sharedReviewedDraftCommand } from '@thesis-ledger/api-client';
import {
  type ImportDraftReviewRecord,
  type ImportDraftRow,
} from '@thesis-ledger/schemas';

export const draftStatusLabels = {
  pending: '待审核',
  reviewed: '已审核',
  partial: '部分提交',
  committed: '已提交',
  cancelled: '已取消',
};

export const draftSaveActionLabel = (
  status: ImportDraftReviewRecord['status'],
  saving: boolean,
) => {
  if (saving) return '保存中……';
  if (status === 'partial') return '创建后续修订';
  return '保存草稿修订';
};
export const draftSourceLabel = (source: string) => {
  const labels: Record<string, string> = {
    alipay: '支付宝',
    ths: '同花顺',
    broker: '券商',
    bank: '银行',
    'fund-platform': '基金平台',
    unknown: '待核对',
    'manual-review': '人工录入',
  };
  return labels[source] ?? '外部导入';
};

export { draftIsFrozen, rowCanSubmit } from '@thesis-ledger/api-client';

export async function reviewedDraftCommand(draft: ImportDraftReviewRecord, rows: ImportDraftRow[]) {
  return sharedReviewedDraftCommand(draft, rows, async (value) => {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  });
}

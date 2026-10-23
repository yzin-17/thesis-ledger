import type { ImportDraft } from '@thesis-ledger/schemas';

export type ImportRow = ImportDraft['rows'][number];

export interface ImportDraftRecord {
  id: string;
  accountId: string;
  source: 'alipay' | 'ths' | 'broker' | 'bank' | 'fund-platform' | 'unknown';
  sourceConfidence: number;
  status: 'pending' | 'reviewed' | 'partial' | 'committed' | 'cancelled';
  rows: ImportRow[];
  createdAt: string;
}

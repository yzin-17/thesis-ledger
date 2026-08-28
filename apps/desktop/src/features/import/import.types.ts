export interface ImportRow {
  rowId?: string;
  rawSymbol: string;
  rawName?: string;
  assetType?: 'stock' | 'etf' | 'fund';
  symbol?: string;
  matchStatus: 'matched' | 'ambiguous' | 'unmatched';
  matchCandidates: string[];
  quantity?: string;
  costPrice?: string;
  marketPrice?: string;
  marketValue?: string;
  profit?: string;
  profitRate?: string;
  confidence: number;
  rawText: Record<string, string>;
  issues: string[];
}

export interface ImportDraftRecord {
  id: string;
  accountId: string;
  source: 'alipay' | 'ths' | 'broker' | 'bank' | 'fund-platform' | 'unknown';
  sourceConfidence: number;
  status: 'pending' | 'reviewed' | 'partial' | 'committed' | 'cancelled';
  rows: ImportRow[];
  createdAt: string;
}

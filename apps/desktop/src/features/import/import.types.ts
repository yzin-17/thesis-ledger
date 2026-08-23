export interface ImportRow {
  rawSymbol: string;
  rawName?: string;
  assetType?: 'stock' | 'etf' | 'fund';
  symbol?: string;
  matchStatus: 'matched' | 'ambiguous' | 'unmatched';
  matchCandidates: string[];
  quantity?: number;
  costPrice?: number;
  marketPrice?: number;
  marketValue?: number;
  profit?: number;
  profitRate?: number;
  confidence: number;
  rawText: Record<string, string>;
  issues: string[];
}

export interface ImportDraftRecord {
  id: string;
  accountId: string;
  source: 'alipay' | 'ths' | 'broker' | 'bank' | 'fund-platform' | 'unknown';
  sourceConfidence: number;
  status: 'pending' | 'reviewed' | 'committed' | 'cancelled';
  rows: ImportRow[];
  createdAt: string;
}

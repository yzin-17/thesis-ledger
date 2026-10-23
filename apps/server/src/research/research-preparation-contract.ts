import type { ResearchPrivateMaterialV2, ResearchScopeSnapshotV2 } from '@thesis-ledger/schemas';

/** 一次只读范围查询的准备输入；最终币种与可引用身份仍须经实际材料核对。 */
export type ResearchPreparedContext = {
  scopeSnapshot: ResearchScopeSnapshotV2;
  privateMaterial: ResearchPrivateMaterialV2 | null;
  fetchedAt: string;
  reasons: string[];
};

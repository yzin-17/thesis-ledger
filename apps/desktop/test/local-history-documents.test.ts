import { describe, expect, it } from 'vitest';
import {
  filterLocalHistoryDocuments,
  localHistoryDocumentGroups,
} from '../src/features/market-data/local-history-documents.js';
import type { ProviderManifest } from '../src/features/market-data/market-data.types.js';

export const noticeProvider = (): ProviderManifest => ({
  providerId: 'official-states',
  displayName: '发行人停复牌公告（本地）',
  version: 1,
  configured: true,
  enabled: true,
  credentialConfigured: true,
  capabilities: {},
  sourceKind: 'local_history',
  upstreamSources: ['停复牌公告', '风险警示公告'].map((displayName, i) => ({
    sourceId: `source-${i}`,
    displayName,
    capabilities: {},
    localHistory: {
      datasetId: `dataset-${i}`,
      symbols: ['000995.SZ'],
      coverage: { start: '2023-08-16', end: '2023-08-21' },
      updateMode: 'bundled',
      documents: [
        {
          id: `notice-${i}`,
          title: '皇台酒业撤销退市风险警示暨停牌公告',
          url: 'https://static.cninfo.com.cn/finalpage/notice.PDF',
          publishedDate: '2023-08-17',
        },
      ],
    },
  })),
});

describe('已收录公告归集', () => {
  it('同原文合为一份公告并保留全部用途，按标的或标题搜索', () => {
    const groups = localHistoryDocumentGroups(noticeProvider());
    expect(groups).toHaveLength(1);
    expect(groups[0]?.references.map((reference) => reference.sourceName)).toEqual([
      '停复牌公告',
      '风险警示公告',
    ]);
    expect(filterLocalHistoryDocuments(groups, '000995.sz')).toHaveLength(1);
    expect(filterLocalHistoryDocuments(groups, '皇台')).toHaveLength(1);
    expect(filterLocalHistoryDocuments(groups, '风险警示')).toHaveLength(1);
    expect(filterLocalHistoryDocuments(groups, '600519')).toEqual([]);
  });
  it('缺失元信息保持为空，原始来源不因归集改变', () => {
    const provider = noticeProvider();
    const before = JSON.stringify(provider);
    localHistoryDocumentGroups(provider);
    expect(JSON.stringify(provider)).toBe(before);
    expect(localHistoryDocumentGroups({ ...provider, upstreamSources: [] })).toEqual([]);
  });
});

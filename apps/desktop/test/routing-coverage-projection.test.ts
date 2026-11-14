import { describe, expect, it } from 'vitest';
import type { RoutingConfigPreview, RoutingConfigView } from '@thesis-ledger/schemas';
import { projectRoutingCoverage } from '../src/features/market-data/routing-coverage-projection.js';

const marketKey = {
  kind: 'data',
  market: 'CN',
  assetType: 'STOCK',
  capability: 'REALTIME_QUOTE',
} as const;
const newsKey = { ...marketKey, capability: 'NEWS_FEED' } as const;
const baseline: RoutingConfigView = {
  revision: 1,
  catalogRevision: 2,
  catalogStatus: 'complete',
  syncState: 'applied',
  newKeys: [],
  config: {
    version: 1,
    preserved: [],
    keys: [marketKey, newsKey],
    rules: [
      { scope: { category: 'market' }, providers: ['futu'] },
      { scope: { category: 'research' }, providers: ['akshare'] },
    ],
  },
  diagnostics: [
    { key: marketKey, state: 'single_source', reasons: [], inheritedFrom: { category: 'market' } },
    { key: newsKey, state: 'single_source', reasons: [], inheritedFrom: { category: 'research' } },
  ],
};

describe('覆盖诊断按大类隔离', () => {
  it('未修改时全部展示；仅修改行情时新闻诊断保持', () => {
    expect(projectRoutingCoverage(baseline.config, baseline, null).diagnostics).toEqual(
      baseline.diagnostics,
    );
    const draft = structuredClone(baseline.config);
    draft.rules[0]!.providers = ['tencent'];
    const result = projectRoutingCoverage(draft, baseline, null);
    expect([...result.pendingCategories]).toEqual(['market']);
    expect(result.diagnostics).toEqual([baseline.diagnostics[1]]);
    expect(baseline.config.rules[0]!.providers).toEqual(['futu']);
  });

  it('连续修改多个类后，仅恢复的类重新展示基线诊断', () => {
    const draft = structuredClone(baseline.config);
    draft.rules[0]!.providers = [];
    draft.rules[1]!.providers = ['tencent'];
    expect(projectRoutingCoverage(draft, baseline, null).diagnostics).toEqual([]);
    draft.rules[0] = structuredClone(baseline.config.rules[0]!);
    const result = projectRoutingCoverage(draft, baseline, null);
    expect([...result.pendingCategories]).toEqual(['research']);
    expect(result.diagnostics).toEqual([baseline.diagnostics[0]]);
  });

  it('新增或移除精确能力范围仅影响对应大类', () => {
    const draft = structuredClone(baseline.config);
    draft.keys = [marketKey];
    const result = projectRoutingCoverage(draft, baseline, null);
    expect([...result.pendingCategories]).toEqual(['research']);
    expect(result.diagnostics).toEqual([baseline.diagnostics[0]]);
  });

  it('有效预览展示当前草稿诊断，关闭后仍按大类隔离', () => {
    const draft = structuredClone(baseline.config);
    draft.rules[0]!.providers = [];
    const preview: RoutingConfigPreview = {
      previewToken: 'valid',
      changes: [],
      routes: [],
      exceptions: 0,
      diagnostics: [{ ...baseline.diagnostics[0]!, state: 'uncovered' }, baseline.diagnostics[1]!],
    };
    const result = projectRoutingCoverage(draft, baseline, preview);
    expect(result.pendingCategories.size).toBe(0);
    expect(result.diagnostics).toBe(preview.diagnostics);
    expect(result.label).toBe('草稿覆盖诊断');
    expect(projectRoutingCoverage(draft, baseline, null).diagnostics).toEqual([
      baseline.diagnostics[1],
    ]);
  });
});

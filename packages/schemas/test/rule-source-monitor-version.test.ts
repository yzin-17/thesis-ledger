import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ruleMonitorVersionDetailSchema,
  ruleMonitorVersionRequestSchema,
} from '../src/rule-source-monitor-versions.js';

const fixture = () =>
  JSON.parse(
    readFileSync(new URL('../fixtures/rule-source-monitor-version.json', import.meta.url), 'utf8'),
  );
describe('资料快照与差异合同', () => {
  it('接受两版本正文，旧记录明确缺失，不将缺失识别为正文一致', () => {
    const { request, detail } = fixture();
    expect(ruleMonitorVersionRequestSchema.parse(request)).toEqual(request);
    expect(ruleMonitorVersionDetailSchema.parse(detail)).toEqual(detail);
    expect(
      ruleMonitorVersionDetailSchema.parse({
        ...detail,
        snapshot: {
          status: 'unavailable',
          format: null,
          text: null,
          capturedAt: null,
          reason: 'legacy_missing',
        },
        comparison: {
          ...detail.comparison,
          status: 'unavailable',
          reason: 'snapshot_unavailable',
          added: 0,
          removed: 0,
          lines: [],
        },
      }).snapshot.status,
    ).toBe('unavailable');
  });
  it('拒绝非法版本、缺采集时间的正文、越界文本与伪造差异统计', () => {
    const { request, detail } = fixture();
    expect(
      ruleMonitorVersionRequestSchema.safeParse({ ...request, contentHash: '../bad' }).success,
    ).toBe(false);
    expect(
      ruleMonitorVersionRequestSchema.safeParse({ ...request, baseHash: request.contentHash })
        .success,
    ).toBe(false);
    for (const snapshot of [
      { ...detail.snapshot, capturedAt: null },
      { ...detail.snapshot, text: 'x'.repeat(250001) },
      { ...detail.snapshot, reason: 'legacy_missing' },
    ])
      expect(ruleMonitorVersionDetailSchema.safeParse({ ...detail, snapshot }).success).toBe(false);
    expect(
      ruleMonitorVersionDetailSchema.safeParse({
        ...detail,
        comparison: { ...detail.comparison, added: 0 },
      }).success,
    ).toBe(false);
  });
});

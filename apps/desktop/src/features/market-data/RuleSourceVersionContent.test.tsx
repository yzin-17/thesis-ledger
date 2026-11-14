// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RuleSourceVersionContent } from './RuleSourceVersionContent.js';
import type { RuleMonitorVersionDetail } from '@thesis-ledger/schemas';

const interact = (work: () => void) =>
  act(async () => {
    work();
    await Promise.resolve();
  });

const sample = (): RuleMonitorVersionDetail => ({
  version: 'rule-source-monitor-v1',
  kind: 'document',
  identity: 'https://www.sse.com.cn/rule',
  contentHash: 'b'.repeat(64),
  snapshot: {
    status: 'available',
    format: 'html',
    text: '<script>unexpected()</script>\n收费0.2%',
    capturedAt: '2026-11-10T00:00:00Z',
    reason: null,
  },
  comparison: {
    baseHash: 'a'.repeat(64),
    status: 'available',
    reason: null,
    added: 1,
    removed: 1,
    lines: [
      { type: 'removed', text: '收费0.1%' },
      { type: 'added', text: '收费0.2%' },
    ],
  },
});
describe('保存正文及差异展示', () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await interact(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
  const render = (data: RuleMonitorVersionDetail) =>
    interact(() => root.render(<RuleSourceVersionContent data={data} />));
  it('分别标记新增与删除，并以文本呈现历史 HTML', async () => {
    await render(sample());
    expect(host.querySelector('[aria-label="正文差异"]')?.textContent).toContain('收费0.1%');
    expect(host.querySelector('[aria-label="新增"]')?.textContent).toBe('+');
    expect(host.querySelector('[aria-label="删除"]')?.textContent).toBe('−');
    await interact(() =>
      [...host.querySelectorAll('button')].find((item) => item.textContent === '正文快照')!.click(),
    );
    expect(host.querySelector('pre')?.textContent).toContain('<script>unexpected()</script>');
    expect(host.querySelector('script')).toBeNull();
  });
  it('缺失快照及超限明确不可比较，不展示为零变化', async () => {
    const data = sample();
    data.comparison = {
      baseHash: 'a'.repeat(64),
      status: 'unavailable',
      reason: 'snapshot_unavailable',
      added: 0,
      removed: 0,
      lines: [],
    };
    await render(data);
    expect(host.textContent).toContain('缺少正文快照');
    expect(host.textContent).not.toContain('新增 0');
    data.comparison.reason = 'diff_too_large';
    await render({ ...data });
    expect(host.textContent).toContain('比较内容超过上限');
  });
  it('旧记录与单一版本保持独立说明', async () => {
    const data = sample();
    data.comparison = null;
    data.snapshot = {
      status: 'unavailable',
      format: null,
      text: null,
      capturedAt: null,
      reason: 'legacy_missing',
    };
    await render(data);
    expect(host.textContent).toContain('无法还原更早时点的原文');
    await interact(() =>
      [...host.querySelectorAll('button')].find((item) => item.textContent === '版本差异')!.click(),
    );
    expect(host.textContent).toContain('目前只有一个内容版本');
  });
});

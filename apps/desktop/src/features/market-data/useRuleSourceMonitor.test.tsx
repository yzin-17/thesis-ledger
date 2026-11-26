// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ruleMonitorStatusSchema } from '@thesis-ledger/schemas';
import { useRuleSourceMonitor } from './useRuleSourceMonitor.js';

const api = vi.hoisted(() => ({
  getRuleMonitor: vi.fn(),
  createRuleMonitorTask: vi.fn(),
  configureRuleMonitor: vi.fn(),
  checkRuleSources: vi.fn(),
}));
vi.mock('../../shared/api/client.js', () => ({ getDesktopApiClient: () => ({ market: api }) }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('规则监测来源的人工保存', () => {
  it.each([true, false])(
    '当前修订读取成功=%s 时仅通过保存入口重试，保持全部草稿',
    async (success) => {
      vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
      const sample = JSON.parse(
        readFileSync(
          resolve(
            dirname(fileURLToPath(import.meta.url)),
            '../../../../../packages/schemas/fixtures/rule-source-monitor-v1.json',
          ),
          'utf8',
        ),
      ) as { status: unknown };
      const initial = ruleMonitorStatusSchema.parse(sample.status);
      const sourceIds = Array.from({ length: 17 }, (_, i) => `official-rules/source-${i}`);
      api.getRuleMonitor.mockResolvedValue(initial);
      api.createRuleMonitorTask.mockRejectedValue(new Error('受控修订冲突'));
      let monitor!: ReturnType<typeof useRuleSourceMonitor>;
      function Probe() {
        monitor = useRuleSourceMonitor();
        return null;
      }
      const host = document.createElement('div');
      const root = createRoot(host);
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const wait = (check: () => void) =>
        vi.waitFor(async () => {
          await act(async () => {
            await Promise.resolve();
          });
          check();
        });
      try {
        await act(async () => {
          root.render(
            <QueryClientProvider client={client}>
              <Probe />
            </QueryClientProvider>,
          );
          await Promise.resolve();
        });
        await wait(() => expect(monitor.selection).toBeDefined());
        await act(async () => {
          monitor.update({ sourceIds });
          await Promise.resolve();
        });
        await act(async () => {
          monitor.createTask();
          await Promise.resolve();
        });
        await wait(() => expect(monitor.create.isError).toBe(true));
        await wait(() => expect(monitor.status.isFetching).toBe(false));
        expect(api.createRuleMonitorTask).toHaveBeenCalledTimes(1);
        if (!success) {
          api.getRuleMonitor.mockRejectedValue(new Error('受控读取失败'));
          await act(async () => {
            monitor.createTask();
            await Promise.resolve();
          });
          await wait(() => expect(monitor.create.isError).toBe(true));
          expect(api.createRuleMonitorTask).toHaveBeenCalledTimes(1);
          expect(monitor.selection!.sourceIds).toEqual(sourceIds);
          expect(monitor.dirty).toBe(true);
        }
        api.getRuleMonitor.mockResolvedValue({
          ...initial,
          config: { ...initial.config, revision: 7 },
        });
        api.createRuleMonitorTask.mockResolvedValue({
          version: initial.version,
          config: { ...initial.config, revision: 8, taskCreated: true, sourceIds },
        });
        await act(async () => {
          monitor.createTask();
          await Promise.resolve();
        });
        await wait(() => expect(monitor.create.isSuccess).toBe(true));
        expect(api.createRuleMonitorTask).toHaveBeenCalledTimes(2);
        expect(api.createRuleMonitorTask.mock.calls[1]![0]).toMatchObject({
          expectedRevision: 7,
          sourceIds,
        });
        expect(monitor.create.isError).toBe(false);
        expect(monitor.dirty).toBe(false);
        expect(api.configureRuleMonitor).not.toHaveBeenCalled();
        expect(api.checkRuleSources).not.toHaveBeenCalled();
      } finally {
        await act(async () => {
          root.unmount();
          await Promise.resolve();
        });
        client.clear();
      }
    },
  );
});

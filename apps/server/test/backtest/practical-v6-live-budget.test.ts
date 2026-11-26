import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { practicalV6Budget } from './practical-v6-live-budget.fixture.js';

const request = {
  method: 'POST',
  body: JSON.stringify({
    model: 'qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m',
    response_format: { type: 'json_schema' },
  }),
};
const url = 'http://192.168.5.20:1234/v1/chat/completions';
it.each(['limit', 'lower-limit', 'unknown', 'preview'] as const)('真实发送预算防护：%s', async (scenario) => {
  const directory = mkdtempSync(resolve(tmpdir(), 'practical-v6-budget-'));
  const original = globalThis.fetch;
  const forward = vi.fn(async () => {
    if (scenario === 'unknown') throw new Error('连接中断');
    return new Response('{}');
  });
  globalThis.fetch = forward;
  const maximum = scenario === 'lower-limit' ? 2 : 10;
  const budget = practicalV6Budget(directory, scenario !== 'preview', maximum);
  try {
    budget.begin('discovery/probe');
    if (scenario === 'limit' || scenario === 'lower-limit') {
      await fetch(url, request);
      budget.complete();
      await expect(fetch(url, request)).rejects.toThrow('禁止自动重试');
      for (let i = 0; i < maximum - 1; i++) {
        budget.begin('sample-' + i);
        await fetch(url, request);
        budget.complete();
      }
      budget.begin('eleventh');
      await expect(fetch(url, request)).rejects.toThrow('预算');
      expect(forward).toHaveBeenCalledTimes(maximum);
      expect(JSON.parse(readFileSync(resolve(directory, 'call-ledger.json'), 'utf8')).sent).toBe(
        maximum,
      );
    } else if (scenario === 'unknown') {
      await expect(fetch(url, request)).rejects.toThrow('连接中断');
      expect(() => budget.begin('next')).toThrow();
      expect(forward).toHaveBeenCalledTimes(1);
    } else {
      await expect(fetch(url, request)).rejects.toThrow('离线预检');
      expect(forward).not.toHaveBeenCalled();
    }
    expect(() => practicalV6Budget(directory, true)).toThrow();
  } finally {
    budget.restore();
    globalThis.fetch = original;
    rmSync(directory, { recursive: true, force: true });
  }
});

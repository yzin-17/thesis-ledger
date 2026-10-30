import { z } from 'zod';
import { observeAiRun, type ObservedAiRun } from './ai-run-observer.js';

const runId = z.uuid().parse(process.argv[2]);
const baseURL = new URL(process.argv[3] ?? 'http://127.0.0.1:3000/api/v1/');
if (!['http:', 'https:'].includes(baseURL.protocol)) throw new Error('观察地址必须使用HTTP');
if (!baseURL.pathname.endsWith('/')) baseURL.pathname += '/';
const controller = new AbortController();
const stop = () => controller.abort('observer_stopped');
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
try {
  const receipt = await observeAiRun({
    runId,
    signal: controller.signal,
    read: async (signal) => {
      // 这是单次GET观察等待，取消此请求不取消后台研究。
      const response = await fetch(new URL(`ai/runs/${runId}`, baseURL), {
        method: 'GET',
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
        headers: process.env.THESIS_LEDGER_OBSERVER_TOKEN
          ? { authorization: `Bearer ${process.env.THESIS_LEDGER_OBSERVER_TOKEN}` }
          : {},
      });
      if (!response.ok) throw new Error(`读取任务HTTP ${response.status}`);
      return (await response.json()) as ObservedAiRun;
    },
  });
  console.log(
    JSON.stringify({
      ...receipt,
      message:
        receipt.kind === 'pending'
          ? '观察已停止，后台最终状态待确认；保留任务标识继续反读。'
          : '已读到持久化终态。',
    }),
  );
  process.exitCode = receipt.kind === 'pending' ? 3 : 0;
} finally {
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
}

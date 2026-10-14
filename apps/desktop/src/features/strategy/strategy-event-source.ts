import { delay } from 'es-toolkit';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import { getDesktopApiClient } from '../../shared/api/client.js';

export function createBacktestStreamSource(
  request = (signal: AbortSignal) =>
    getDesktopApiClient().fetchResponse('/backtests/events', { signal }),
) {
  const controller = new AbortController();
  const target = new EventTarget();
  const source = {
    onopen: null as ((event: Event) => void) | null,
    addEventListener: target.addEventListener.bind(target),
    close: () => controller.abort(),
  };
  const run = async () => {
    let retry = 10_000;
    while (!controller.signal.aborted) {
      try {
        const response = await request(controller.signal);
        if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream'))
          throw new Error('回测事件流响应无效');
        source.onopen?.(new Event('open'));
        const reader = response.body.getReader();
        const cancelRead = () => void reader.cancel().catch(() => undefined);
        controller.signal.addEventListener('abort', cancelRead, { once: true });
        const decoder = new TextDecoder();
        let pending = '';
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            pending = (pending + decoder.decode(chunk.value, { stream: true })).replace(
              /\r\n/g,
              '\n',
            );
            let boundary: number;
            while ((boundary = pending.indexOf('\n\n')) >= 0) {
              const frame = pending.slice(0, boundary);
              pending = pending.slice(boundary + 2);
              let type = 'message';
              const data: string[] = [];
              for (const line of frame.split('\n')) {
                if (line.startsWith('event:')) type = line.slice(6).trim();
                else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
                else if (/^retry:\s*\d+$/.test(line)) retry = Number(line.slice(6).trim());
              }
              if (data.length)
                target.dispatchEvent(new MessageEvent(type, { data: data.join('\n') }));
            }
          }
        } finally {
          controller.signal.removeEventListener('abort', cancelRead);
          await reader.cancel().catch(() => undefined);
          reader.releaseLock();
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ThesisLedgerApiError && error.status === 429)
          retry = error.retryAfterMs ?? 60_000;
      }
      try {
        await delay(retry, { signal: controller.signal });
      } catch {
        return;
      }
    }
  };
  void run();
  return source;
}

import { throttle } from 'es-toolkit/function';
import { parseChartMessage, type ChartDiagnostic } from './chart-document';

export function createChartBridge(
  instanceId: string,
  callbacks: {
    onOlder: () => void;
    onReady: () => void;
    onDiagnostic?: (kind: ChartDiagnostic) => void;
  },
) {
  let active = true;
  const older = throttle(callbacks.onOlder, 800, { edges: ['leading'] });
  const move = throttle(() => callbacks.onDiagnostic?.('move'), 200, { edges: ['leading'] });
  const range = throttle(() => callbacks.onDiagnostic?.('range'), 200, { edges: ['leading'] });
  return {
    start() {
      active = true;
    },
    receive(raw: string) {
      if (!active) return;
      const message = parseChartMessage(raw, instanceId);
      if (message?.kind === 'older') older();
      if (message?.kind === 'ready') callbacks.onReady();
      if (message?.kind === 'touch') callbacks.onDiagnostic?.('touch');
      if (message?.kind === 'move') move();
      if (message?.kind === 'range') range();
      if (message?.kind === 'cancel' || message?.kind === 'end')
        callbacks.onDiagnostic?.(message.kind);
    },
    dispose() {
      active = false;
      older.cancel();
      move.cancel();
      range.cancel();
    },
  };
}

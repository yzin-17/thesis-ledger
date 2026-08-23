import type { Dispatch, FormEvent, SetStateAction } from 'react';
import type { useToastManager } from '@/components/ui/toast';

import type {
  BacktestJob,
  CreateStrategyInput,
  QueueBacktestInput,
  StrategyRecord,
} from './strategy.types.js';

type ToastManager = Pick<ReturnType<typeof useToastManager>, 'add'>;
type AsyncMutation<Input, Output> = {
  mutateAsync: (input: Input) => Promise<Output>;
};

type Dependencies = {
  name: string;
  schemaText: string;
  busyAction: string | null;
  setBusyAction: Dispatch<SetStateAction<string | null>>;
  toastManager: ToastManager;
  createMutation: AsyncMutation<CreateStrategyInput, StrategyRecord>;
  fetchBarsMutation: AsyncMutation<string, unknown[]>;
  queueMutation: AsyncMutation<QueueBacktestInput, BacktestJob>;
  runMutation: AsyncMutation<string, BacktestJob>;
  cancelMutation: AsyncMutation<string, BacktestJob>;
  load: () => Promise<unknown>;
};

export const createStrategyActionHandlers = (dependencies: Dependencies) => {
  const {
    name,
    schemaText,
    busyAction,
    setBusyAction,
    toastManager,
    createMutation,
    fetchBarsMutation,
    queueMutation,
    runMutation,
    cancelMutation,
    load,
  } = dependencies;

  const createStrategy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyAction) return;
    setBusyAction('create-strategy');
    try {
      const parsedSchema: unknown = JSON.parse(schemaText);
      if (!parsedSchema || typeof parsedSchema !== 'object' || Array.isArray(parsedSchema)) {
        throw new Error('strategy-schema');
      }
      await createMutation.mutateAsync({ name, schema: parsedSchema as Record<string, unknown> });
      toastManager.add({
        title: '策略已创建',
        description: '旧版本不会被覆盖。',
        type: 'success',
        timeout: 2800,
      });
      await load();
    } catch {
      toastManager.add({
        title: '策略创建失败',
        description: '请检查策略 JSON 或 Schema。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const queue = async (strategy: StrategyRecord) => {
    if (busyAction) return;
    const version = strategy.versions.at(-1);
    if (!version) return;
    setBusyAction(`queue:${strategy.id}`);
    let schema: Record<string, unknown>;
    try {
      schema = JSON.parse(schemaText) as Record<string, unknown>;
    } catch {
      setBusyAction(null);
      toastManager.add({
        title: '回测排队失败',
        description: '请检查策略 JSON 或 Schema。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
      return;
    }
    try {
      const universe = schema.universe;
      const symbols =
        universe &&
        typeof universe === 'object' &&
        'symbols' in universe &&
        Array.isArray((universe as { symbols?: unknown }).symbols)
          ? (universe as { symbols: unknown[] }).symbols
          : [];
      const symbol = typeof symbols[0] === 'string' ? symbols[0] : null;
      const bars = symbol ? await fetchBarsMutation.mutateAsync(symbol) : [];
      await queueMutation.mutateAsync({
        id: crypto.randomUUID(),
        strategyVersionId: version.id,
        status: 'queued',
        period: { start: '2025-01-01', end: '2025-01-31' },
        dataAsOf: new Date().toISOString(),
        warnings: [],
        strategy: schema,
        bars,
        initialCash: 100000,
      });
      toastManager.add({ title: '回测已排队', type: 'success', timeout: 2800 });
      await load();
    } catch {
      toastManager.add({
        title: '回测排队失败',
        description: '请检查策略配置和服务连接。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const run = async (jobId: string) => {
    if (busyAction) return;
    setBusyAction(`run:${jobId}`);
    try {
      await runMutation.mutateAsync(jobId);
      toastManager.add({ title: '回测已启动', type: 'success', timeout: 2800 });
      await load();
    } catch {
      toastManager.add({
        title: '回测启动失败',
        description: '请检查任务状态和服务连接。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const cancel = async (jobId: string) => {
    if (busyAction) return;
    setBusyAction(`cancel:${jobId}`);
    try {
      await cancelMutation.mutateAsync(jobId);
      toastManager.add({ title: '回测已取消', type: 'success', timeout: 2800 });
      await load();
    } catch {
      toastManager.add({
        title: '回测取消失败',
        description: '请检查任务状态和服务连接。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };

  return { createStrategy, queue, run, cancel };
};

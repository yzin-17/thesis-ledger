import type { Dispatch, FormEvent, SetStateAction } from 'react';
import type { useToastManager } from '@/components/ui/toast';

import type {
  BacktestJob,
  BacktestSetupInput,
  CreateStrategyInput,
  CreateStrategyVersionInput,
  QueueBacktestInput,
  StrategyRecord,
  StrategySchema,
  StrategyVersion,
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
  createVersionMutation?: AsyncMutation<CreateStrategyVersionInput, StrategyVersion>;
  fetchBarsMutation: AsyncMutation<string, unknown[]>;
  queueMutation: AsyncMutation<QueueBacktestInput, BacktestJob>;
  runMutation: AsyncMutation<string, BacktestJob>;
  cancelMutation: AsyncMutation<string, BacktestJob>;
  load: () => Promise<unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseSchemaText = (schemaText: string): StrategySchema => {
  const parsed: unknown = JSON.parse(schemaText);
  if (!isRecord(parsed)) throw new Error('strategy-schema');
  return parsed;
};

const symbolsFromSchema = (schema: StrategySchema) => {
  const universe = schema.universe;
  if (!isRecord(universe) || !Array.isArray(universe.symbols)) return [];
  return universe.symbols.filter((symbol): symbol is string => typeof symbol === 'string');
};

const errorToast = (toastManager: ToastManager, title: string, description: string) => {
  toastManager.add({
    title,
    description,
    type: 'error',
    timeout: 0,
    priority: 'high',
  });
};

const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

export const validateBacktestSetup = (setup: BacktestSetupInput) => {
  if (!validDate(setup.period.start) || !validDate(setup.period.end)) {
    return '请选择有效的回测日期。';
  }
  if (setup.period.start > setup.period.end) return '开始日期不能晚于结束日期。';
  if (!Number.isFinite(setup.initialCash) || setup.initialCash <= 0) {
    return '初始资金必须大于 0。';
  }
  if (
    setup.inSampleEnd &&
    (!validDate(setup.inSampleEnd) ||
      setup.inSampleEnd < setup.period.start ||
      setup.inSampleEnd > setup.period.end)
  ) {
    return '样本内结束日期必须位于回测区间内。';
  }
  return null;
};

export const createStrategyActionHandlers = (dependencies: Dependencies) => {
  const {
    name,
    schemaText,
    busyAction,
    setBusyAction,
    toastManager,
    createMutation,
    createVersionMutation,
    fetchBarsMutation,
    queueMutation,
    runMutation,
    cancelMutation,
    load,
  } = dependencies;

  const createStrategy = async (eventOrInput: FormEvent<HTMLFormElement> | CreateStrategyInput) => {
    if ('preventDefault' in eventOrInput) eventOrInput.preventDefault();
    if (busyAction) return false;
    setBusyAction('create-strategy');
    try {
      const input =
        'preventDefault' in eventOrInput
          ? { name, schema: { ...parseSchemaText(schemaText), name } }
          : { ...eventOrInput, schema: { ...eventOrInput.schema, name: eventOrInput.name } };
      await createMutation.mutateAsync(input);
      toastManager.add({
        title: '策略已创建',
        description: '策略 v1 已保存，旧版本不会被覆盖。',
        type: 'success',
        timeout: 2800,
      });
      await load();
      return true;
    } catch {
      errorToast(toastManager, '策略创建失败', '请检查策略配置或服务连接。');
      return false;
    } finally {
      setBusyAction(null);
    }
  };

  const createVersion = async (strategyId: string, schema: StrategySchema) => {
    if (busyAction || !createVersionMutation) return false;
    setBusyAction(`create-version:${strategyId}`);
    try {
      await createVersionMutation.mutateAsync({ strategyId, schema });
      toastManager.add({
        title: '新版本已保存',
        description: '原有版本保持不变。',
        type: 'success',
        timeout: 2800,
      });
      await load();
      return true;
    } catch {
      errorToast(toastManager, '版本保存失败', '请检查策略配置或服务连接。');
      return false;
    } finally {
      setBusyAction(null);
    }
  };

  const startBacktest = async (version: StrategyVersion, setup: BacktestSetupInput) => {
    if (busyAction) return false;
    const setupError = validateBacktestSetup(setup);
    if (setupError) {
      errorToast(toastManager, '回测配置无效', setupError);
      return false;
    }
    const schema = version.schema;
    if (!schema) {
      errorToast(toastManager, '回测排队失败', '当前版本缺少可执行 Schema，请重新加载策略。');
      return false;
    }
    const symbol = symbolsFromSchema(schema)[0];
    if (!symbol) {
      errorToast(toastManager, '回测排队失败', '策略版本至少需要一个标的。');
      return false;
    }
    setBusyAction(`queue:${version.id}`);
    try {
      const bars = await fetchBarsMutation.mutateAsync(symbol);
      const queueInput: QueueBacktestInput = {
        id: crypto.randomUUID(),
        strategyVersionId: version.id,
        status: 'queued',
        period: setup.period,
        ...(setup.inSampleEnd ? { inSampleEnd: setup.inSampleEnd } : {}),
        dataAsOf: new Date().toISOString(),
        warnings:
          symbolsFromSchema(schema).length > 1 ? ['仅使用策略版本中的首个标的进行回测'] : [],
        strategy: schema,
        bars,
        initialCash: setup.initialCash,
      };
      const queuedJob = await queueMutation.mutateAsync(queueInput);
      toastManager.add({
        title: '回测已排队',
        description: '正在启动回测任务。',
        type: 'success',
        timeout: 2800,
      });
      try {
        await runMutation.mutateAsync(queuedJob.id ?? queueInput.id);
        toastManager.add({ title: '回测已启动', type: 'success', timeout: 2800 });
      } catch {
        toastManager.add({
          title: '回测启动失败',
          description: '任务仍保留在队列中，可在回测任务中重试。',
          type: 'error',
          timeout: 0,
          priority: 'high',
        });
      }
      await load();
      return true;
    } catch {
      errorToast(toastManager, '回测排队失败', '请检查策略配置、市场数据和服务连接。');
      return false;
    } finally {
      setBusyAction(null);
    }
  };

  const queue = async (strategy: StrategyRecord) => {
    const versions = [...strategy.versions].sort((left, right) => right.version - left.version);
    const version = versions[0];
    if (!version) return false;
    let schema = version.schema;
    if (!schema) {
      try {
        schema = parseSchemaText(schemaText);
      } catch {
        errorToast(toastManager, '回测排队失败', '当前策略版本缺少可执行 Schema。');
        return false;
      }
    }
    return startBacktest(
      { ...version, schema },
      {
        period: { start: '2025-01-01', end: '2025-01-31' },
        initialCash: 100_000,
      },
    );
  };

  const run = async (jobId: string) => {
    if (busyAction) return;
    setBusyAction(`run:${jobId}`);
    try {
      await runMutation.mutateAsync(jobId);
      toastManager.add({ title: '回测已启动', type: 'success', timeout: 2800 });
      await load();
    } catch {
      errorToast(toastManager, '回测启动失败', '请检查任务状态和服务连接。');
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
      errorToast(toastManager, '回测取消失败', '请检查任务状态和服务连接。');
    } finally {
      setBusyAction(null);
    }
  };

  return { createStrategy, createVersion, startBacktest, queue, run, cancel };
};

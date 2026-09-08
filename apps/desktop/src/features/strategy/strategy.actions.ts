import type { Dispatch, FormEvent, SetStateAction } from 'react';
import type { useToastManager } from '@/components/ui/toast';

import type {
  BacktestJob,
  BacktestSetupInput,
  CreateStrategyInput,
  CreateStrategyVersionInput,
  FetchStrategyBarsInput,
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
  fetchBarsMutation: AsyncMutation<FetchStrategyBarsInput, unknown[]>;
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

const benchmarkFromSchema = (schema: StrategySchema) =>
  typeof schema.benchmark === 'string' && schema.benchmark.trim() ? schema.benchmark : null;

const dataAsOfFromSchema = (schema: StrategySchema) => {
  const universe = schema.universe;
  if (!isRecord(universe) || typeof universe.asOf !== 'string') return new Date().toISOString();
  return universe.asOf;
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

const refreshSavedStrategy = async (load: Dependencies['load'], toastManager: ToastManager) => {
  try {
    await load();
    return true;
  } catch {
    errorToast(
      toastManager,
      '保存已完成，列表刷新失败',
      '请使用页面刷新按钮重新读取，无需重复保存。',
    );
    return false;
  }
};

const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

const defaultBacktestPeriod = () => {
  const end = new Date();
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 1);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
};

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
  let backgroundPreparationVersionId: string | null = null;

  const refreshStrategyData = () => {
    void load().catch(() => undefined);
  };

  const launchQueuedBacktest = (jobId: string) => {
    void runMutation.mutateAsync(jobId).then(
      () => {
        toastManager.add({ title: '回测已启动', type: 'success', timeout: 2800 });
        refreshStrategyData();
      },
      () => {
        toastManager.add({
          title: '回测启动失败',
          description: '任务仍保留在队列中，可在回测任务中重试。',
          type: 'error',
          timeout: 0,
          priority: 'high',
        });
        refreshStrategyData();
      },
    );
  };

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
      if (!(await refreshSavedStrategy(load, toastManager))) return true;
      toastManager.add({
        title: '策略已创建',
        description: '策略 v1 已保存，旧版本不会被覆盖。',
        type: 'success',
        timeout: 2800,
      });
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
      if (!(await refreshSavedStrategy(load, toastManager))) return true;
      toastManager.add({
        title: '新版本已保存',
        description: '原有版本保持不变。',
        type: 'success',
        timeout: 2800,
      });
      return true;
    } catch {
      errorToast(toastManager, '版本保存失败', '请检查策略配置或服务连接。');
      return false;
    } finally {
      setBusyAction(null);
    }
  };

  const startBacktest = (version: StrategyVersion, setup: BacktestSetupInput): Promise<boolean> => {
    if (busyAction || backgroundPreparationVersionId) return Promise.resolve(false);
    const setupError = validateBacktestSetup(setup);
    if (setupError) {
      errorToast(toastManager, '回测配置无效', setupError);
      return Promise.resolve(false);
    }
    const schema = version.schema;
    if (!schema) {
      errorToast(toastManager, '回测排队失败', '当前版本缺少可执行 Schema，请重新加载策略。');
      return Promise.resolve(false);
    }
    const symbol = symbolsFromSchema(schema)[0];
    if (!symbol) {
      errorToast(toastManager, '回测排队失败', '策略版本至少需要一个标的。');
      return Promise.resolve(false);
    }
    backgroundPreparationVersionId = version.id;
    setBusyAction(`queue:${version.id}`);
    toastManager.add({
      title: '正在后台准备回测',
      description: '完成后会出现在回测任务列表。',
      type: 'success',
      timeout: 2800,
    });
    void (async () => {
      try {
        const bars = await fetchBarsMutation.mutateAsync({ symbol, period: setup.period });
        if (!Array.isArray(bars) || bars.length === 0) {
          errorToast(toastManager, '回测排队失败', '主标的没有可用行情，无法发起回测。');
          return;
        }
        const benchmark = benchmarkFromSchema(schema);
        let benchmarkBars: unknown[] = [];
        let benchmarkWarning: string | null = null;
        if (benchmark && benchmark === symbol) {
          benchmarkBars = bars;
        } else if (benchmark) {
          try {
            benchmarkBars = await fetchBarsMutation.mutateAsync({
              symbol: benchmark,
              period: setup.period,
            });
          } catch {
            benchmarkWarning = '基准行情不可用，已跳过基准比较。';
          }
          if (benchmarkBars.length === 0) benchmarkWarning = '基准行情不可用，已跳过基准比较。';
        }
        const queueInput: QueueBacktestInput = {
          id: crypto.randomUUID(),
          strategyVersionId: version.id,
          status: 'queued',
          period: setup.period,
          ...(setup.inSampleEnd ? { inSampleEnd: setup.inSampleEnd } : {}),
          dataAsOf: dataAsOfFromSchema(schema),
          warnings: [
            ...(symbolsFromSchema(schema).length > 1 ? ['仅使用策略版本中的首个标的进行回测'] : []),
            ...(benchmarkWarning ? [benchmarkWarning] : []),
          ],
          strategy: schema,
          bars,
          ...(benchmarkBars.length > 0 ? { benchmarkBars } : {}),
          initialCash: setup.initialCash,
        };
        const queuedJob = await queueMutation.mutateAsync(queueInput);
        toastManager.add({
          title: '回测已排队',
          description: '任务已进入回测任务，正在后台启动。',
          type: 'success',
          timeout: 2800,
        });
        launchQueuedBacktest(queuedJob.id ?? queueInput.id);
        refreshStrategyData();
      } catch {
        errorToast(toastManager, '回测排队失败', '请检查策略配置、市场数据和服务连接。');
      } finally {
        backgroundPreparationVersionId = null;
        setBusyAction(null);
      }
    })();
    return Promise.resolve(true);
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
        period: defaultBacktestPeriod(),
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

import { aiGenerationContracts, type BacktestStrategy } from '@thesis-ledger/schemas';
import { authoringMessages, AUTHORING_PROMPT_VERSION } from '../../src/strategy-authoring/authoring-prompt.js';
import { authoringOperationSchema } from '../../src/strategy-authoring/authoring-operation-schema.js';
import type { AuthoringOperation } from '../../src/strategy-authoring/authoring-operation.repository.js';
import type { ExperimentRow } from '../../src/strategy-optimization/strategy-optimization-common.js';
import { strategyOptimizationPrompt, STRATEGY_OPTIMIZATION_PROMPT_VERSION } from '../../src/strategy-optimization/strategy-optimization-prompt.js';
import {
  planAuthoringContent,
  fixedAuthoringPlan,
} from './trade-plan-authoring-content.fixture.js';
import { expressionModelCases } from './strategy-expression-model.fixture.js';
import { vi } from 'vitest';

export type PracticalV6Sample = {
  id: string;
  entry: 'discovery' | 'authoring' | 'authoring-modification';
  kind: 'daily' | 'hourly' | 'session' | 'hfq-only';
  intent: string;
};
export const practicalV6Samples: PracticalV6Sample[] = [
  ...expressionModelCases
    .filter((sample) =>
      ['count-confirmation', 'statistics-gap', 'captured-retest', 'timeframes-anchor'].includes(
        sample.id,
      ),
    )
    .map((sample) => ({
      ...sample,
      entry: 'discovery' as const,
      kind: sample.id === 'timeframes-anchor' ? ('hourly' as const) : ('daily' as const),
    })),
  {
    id: 'session-vwap-arithmetic',
    entry: 'authoring',
    kind: 'session',
    intent:
      '使用一分钟已完成行情。空仓且当根收盘相对当日开盘以来累计成交量加权均价的偏离绝对值小于1%时买入；偏离按收盘除以当日累计均价再减1计算。普通退出永不触发。',
  },
  {
    id: 'hfq-only-discovery',
    entry: 'discovery',
    kind: 'hfq-only',
    intent:
      '仅用已经取得的后复权价格研究。空仓且收盘严格高于当根20期简单均线时投入权益的20%，收盘严格低于该均线全部退出。无需原始价格或固定份数，不加其他条件。',
  },
  {
    id: 'stop-only-policy',
    entry: 'authoring-modification',
    kind: 'daily',
    intent:
      '仅增加保护：收盘跌到首笔买入成交价下方5%时，在下一可交易开盘全部退出。保护不随上涨移动，不设冷却、分批或其他控制；原入场、普通退出、仓位、费用和入场触发政策全部保持。',
  },
];

export async function practicalV6Request(
  sample: PracticalV6Sample,
  experiment: ExperimentRow,
  seed: BacktestStrategy,
) {
  const contract = {
    discovery: aiGenerationContracts.strategyDiscovery,
    authoring: aiGenerationContracts.authoringGeneration,
    'authoring-modification': aiGenerationContracts.authoringModification,
  }[sample.entry];
  if (sample.entry === 'discovery')
    return {
      operation: null,
      promptVersion: STRATEGY_OPTIMIZATION_PROMPT_VERSION,
      contract,
      schema: contract.schema,
      messages: [
        ...(await strategyOptimizationPrompt({
          prisma: { $queryRaw: vi.fn(async () => []) } as never,
          experiment,
          strategy: seed,
          descriptors: [],
          modelKey: 'practical-v6-acceptance',
          round: 1,
          useSdkContract: true,
          generationMode: 'native_schema',
        })),
        {
          role: 'user' as const,
          content: sample.intent + ' 仓位为权益20%，佣金0.03%、滑点0.1%，没有另设的独立风控。',
        },
      ],
    };
  const content = planAuthoringContent(false);
  content.title = sample.id;
  content.description = sample.intent;
  content.requirements = [
    {
      id: 'rules',
      quote: sample.intent,
      interpretation: sample.intent,
      state: 'understood',
      definitionPaths: [],
    },
  ];
  content.confirmation!.timeframe = seed.primaryTimeframe;
  content.confirmation!.entrySummary = sample.intent;
  content.confirmation!.exitSummary = '普通退出永不触发。';
  if (sample.entry === 'authoring-modification') {
    const baseline = fixedAuthoringPlan(false);
    delete baseline.tradePlan;
    baseline.entry = {
      type: 'cross',
      direction: 'above',
      left: { type: 'series', sourceId: 'execution', field: 'close' },
      right: {
        type: 'indicator',
        name: 'EMA',
        input: { type: 'series', sourceId: 'execution', field: 'close' },
        params: { period: 20 },
      },
    };
    baseline.exit = { ...baseline.entry, direction: 'below' };
    content.definitionText = JSON.stringify(baseline);
    content.confirmation!.entrySummary = '收盘上穿20期指数均线买入。';
    content.confirmation!.exitSummary = '收盘下穿20期指数均线全部退出。';
  }
  const operation = {
    revision: 1,
    input: {
      content,
      selection: {
        kind: sample.entry === 'authoring' ? 'generate' : 'modify',
        intent: sample.intent,
        generationContract: contract.ref,
        ...(sample.entry === 'authoring-modification' ? { modificationTarget: 'tradePlan' } : {}),
      },
    },
  } as AuthoringOperation;
  return {
    operation,
    promptVersion: AUTHORING_PROMPT_VERSION,
    contract,
    schema: authoringOperationSchema(operation),
    messages: authoringMessages(operation),
  };
}

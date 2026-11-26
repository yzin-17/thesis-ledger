import { vi } from 'vitest';
import { aiGenerationContracts, type BacktestStrategy } from '@thesis-ledger/schemas';
import { authoringMessages } from '../../src/strategy-authoring/authoring-prompt.js';
import { authoringOperationSchema } from '../../src/strategy-authoring/authoring-operation-schema.js';
import { strategyOptimizationPrompt } from '../../src/strategy-optimization/strategy-optimization-prompt.js';
import type { PrismaService } from '../../src/platform/prisma.service.js';
import type { ExperimentRow } from '../../src/strategy-optimization/strategy-optimization-common.js';
import type { AuthoringOperation } from '../../src/strategy-authoring/authoring-operation.repository.js';
import {
  fixedAuthoringPlan,
  planAuthoringContent,
} from './trade-plan-authoring-content.fixture.js';

export const expressionModelCases = [
  {
    id: 'relative-breakout',
    entry: 'discovery',
    intent:
      '空仓且收盘严格高于此前20根日线最高价，并严格高于当根20期指数移动均线的102%才买。前高排除当根；普通退出永不触发。',
  },
  {
    id: 'count-confirmation',
    entry: 'discovery',
    intent:
      '空仓时，最近5根至少3根收阳，而且最近连续3根各自收盘均高于各自当根20期指数移动均线，才买入。窗口含当根；普通退出永不触发。',
  },
  {
    id: 'statistics-gap',
    entry: 'discovery',
    intent:
      '空仓时，20期收盘总体标准差除以20期简单均线所得带宽，不高于最近60根带宽的20%线性插值分位数，且当根开盘相对上一根收盘的跳空幅度绝对值小于2%，才买入。普通退出永不触发。',
  },
  {
    id: 'captured-retest',
    entry: 'discovery',
    intent:
      '收盘突破此前20根最高价时记住那个前高。随后10根内，只要收盘回到该冻结价下方就作废；否则首次收盘再次高于该冻结价的102%时买入，不允许突破当根确认。等待期间不更新冻结价，结束后允许新的突破重新启动。普通退出永不触发。',
  },
  {
    id: 'directional',
    entry: 'discovery',
    intent:
      '空仓且14期ADX大于25、正向方向分量大于负向方向分量，并且20期简单均线严格高于它上一根的值时买入。普通退出永不触发。',
  },
  {
    id: 'confirmed-divergence',
    entry: 'discovery',
    intent:
      '比较最近两个已确认的严格摆动低点，左右各2根，必须等右侧两根完成。最近低点的最低价更低，但两个低点各自当时的14期RSI中，最近的RSI更高时，空仓买入。普通退出永不触发。',
  },
  {
    id: 'timeframes-anchor',
    entry: 'discovery',
    intent:
      '按已完成日线决策。日线收盘高于20期简单均线，同时最近已完成且当时可见的60分钟收盘高于该小时的5期简单均线，而且自2026年3月2日15点北京时间起累计成交量严格高于此前一根日线时的该累计值，才在空仓时买入。普通退出永不触发。',
  },
  {
    id: 'unsupported-data-portfolio',
    entry: 'discovery',
    intent:
      '使用每次财报当时已公开的修订版本计算盈利增长，在当时沪深300成分中每月选前十名等权买入，行业权重不超过20%，并用股指期货空头对冲。缺少能力时保留完整原构思和具体缺项，不能改成单只ETF的均线策略。',
  },
  {
    id: 'trend',
    entry: 'authoring',
    intent: '收盘价上穿20期指数移动均线买入，下穿该均线全部卖出。',
  },
  {
    id: 'reversion',
    entry: 'authoring',
    intent: '收盘价下穿20期指数移动均线买入，上穿该均线全部卖出。',
  },
  {
    id: 'trend-synonym',
    entry: 'authoring',
    intent:
      '收盘原先不高于20期指数移动均线，本根转为高于时买入；原先不低于它，本根转为低于时全部卖出。',
  },
  {
    id: 'only-entry-period',
    entry: 'authoring-modification',
    intent:
      '只把入场条件中的20期指数移动均线改成30期。入场方向和操作数、普通退出中的20期均线以及其他所有配置保持原样。',
  },
  {
    id: 'unspecified-average',
    entry: 'authoring-analysis',
    intent: '收盘上穿20期均线买入，下穿卖出。我没有确定均线类型，请先提出待确认问题，不替我选择。',
  },
] as const;

export type ExpressionModelCase = (typeof expressionModelCases)[number];

export function expressionAuthoringOperation(sample: ExpressionModelCase): AuthoringOperation {
  const content = planAuthoringContent(false);
  content.title = '策略表达受控验收';
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
  const inverse = sample.id === 'reversion';
  content.confirmation!.entrySummary = inverse
    ? '收盘价下穿20期指数移动均线买入。'
    : '收盘价上穿20期指数移动均线买入。';
  content.confirmation!.exitSummary = inverse
    ? '收盘价上穿20期指数移动均线全部卖出。'
    : '收盘价下穿20期指数移动均线全部卖出。';
  if (sample.entry === 'authoring-analysis') {
    content.requirements = [];
    content.confirmation = null;
  }
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
  }
  const kinds = {
    authoring: 'generate',
    'authoring-modification': 'modify',
    'authoring-analysis': 'analyze',
  } as const;
  const kind = kinds[sample.entry as keyof typeof kinds];
  return {
    revision: 1,
    input: {
      content,
      selection: {
        kind,
        intent: sample.intent,
        ...(kind === 'modify' ? { modificationTarget: 'entry' } : {}),
      },
    },
  } as AuthoringOperation;
}

/** 预览与真实样本共用相同输入装配，不从回执修补模型输出。 */
export async function expressionModelRequest(
  sample: ExpressionModelCase,
  experiment: ExperimentRow,
  seed: BacktestStrategy,
  db: PrismaService | null,
) {
  const operation = sample.entry === 'discovery' ? null : expressionAuthoringOperation(sample);
  const contract = {
    discovery: aiGenerationContracts.strategyDiscovery,
    authoring: aiGenerationContracts.authoringGeneration,
    'authoring-modification': aiGenerationContracts.authoringModification,
    'authoring-analysis': aiGenerationContracts.authoringAnalysis,
  }[sample.entry];
  const schema = operation ? authoringOperationSchema(operation) : contract.schema;
  const messages = operation
    ? authoringMessages(operation)
    : [
        ...(await strategyOptimizationPrompt({
          prisma: (db ?? { $queryRaw: vi.fn(async () => []) }) as PrismaService,
          experiment,
          strategy: seed,
          descriptors: [],
          modelKey: 'expression-acceptance',
          round: 1,
          useSdkContract: true,
          generationMode: 'native_schema',
        })),
        {
          role: 'user',
          content: sample.intent + ' 仓位为权益20%，佣金0.03%、滑点0.1%，没有另设的独立风控。',
        },
      ];

  return { operation, contract, schema, messages };
}

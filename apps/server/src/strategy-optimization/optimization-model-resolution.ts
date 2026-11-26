import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  optimizationModelResolutionRequestSchema,
  backtestModelResolutionResultSchema,
  strategySchema,
  type BacktestModelResolutionResult,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { strategyResearchExecutionModel } from '../backtest/backtest-strategy-research-model.js';
import { createDiscoverySeed } from './strategy-optimization-discovery.js';
import { RESEARCH_STRATEGY_SPACE_VERSION } from './strategy-optimization-research.js';

@Injectable()
export class OptimizationModelResolution {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async resolve(body: unknown): Promise<BacktestModelResolutionResult> {
    const request = optimizationModelResolutionRequestSchema.parse(body);
    const { target, ...settings } = request;
    let schema: unknown;
    if (target.sourceMode === 'existing') {
      const version = await this.prisma.strategyVersion.findUnique({
        where: { id: target.strategyVersionId },
      });
      if (!version) throw new NotFoundException('策略版本不存在');
      if (version.schemaVersion !== 1)
        return {
          status: 'blocked',
          reasonCode: 'unsupported-strategy',
          message: '请先选择有效的当前策略版本。',
        };
      schema = version.schema;
    } else {
      schema = createDiscoverySeed(target.discoveryScope, true);
    }
    const parsed = strategySchema.safeParse(schema);
    if (!parsed.success || parsed.data.executionInstrument.assetType === 'fund')
      return {
        status: 'blocked',
        reasonCode: 'unsupported-strategy',
        message: 'AI 实验执行设置仅支持有效的股票或 ETF 策略。',
      };
    const currencies = { CN: 'CNY', HK: 'HKD', US: 'USD' };
    if (currencies[parsed.data.executionInstrument.market] !== settings.currency)
      return {
        status: 'blocked',
        reasonCode: 'rules-incompatible',
        message: '实验币种与执行标的市场不一致，请核对标的和币种。',
      };
    try {
      const reference =
        target.sourceMode === 'existing'
          ? `strategy-version:${target.strategyVersionId}`
          : `app:${RESEARCH_STRATEGY_SPACE_VERSION}`;
      const result = strategyResearchExecutionModel(
        {
          ...settings,
          policy: 'research-defaults',
          strategyVersionId:
            target.sourceMode === 'existing' ? target.strategyVersionId : 'discovery',
        },
        parsed.data,
        new Date().toISOString(),
        reference,
      );
      if (target.sourceMode === 'discovery') {
        result.notes.unshift('从零探索按零佣金、零滑点起步；未配置税费暂不计入。');
        result.model.segments[0]!.assumptions = result.notes;
      }
      return backtestModelResolutionResultSchema.parse(result);
    } catch {
      return {
        status: 'blocked',
        reasonCode: 'rules-incompatible',
        message: '策略费用与实验执行设置不兼容，请核对策略配置。',
      };
    }
  }
}

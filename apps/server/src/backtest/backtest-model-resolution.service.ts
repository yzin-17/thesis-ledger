import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  backtestModelResolutionRequestSchema,
  backtestModelResolutionResultSchema,
  strategySchema,
  type BacktestModelResolutionResult,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { PrismaService } from '../platform/prisma.service.js';
import { savedStrategyExecutionModel } from './backtest-saved-strategy-model.js';
import { strategyResearchExecutionModel } from './backtest-strategy-research-model.js';

@Injectable()
export class BacktestModelResolutionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DsaClient) private readonly dsa: DsaClient,
  ) {}

  async resolve(input: unknown): Promise<BacktestModelResolutionResult> {
    const request = backtestModelResolutionRequestSchema.parse(input);
    const version = await this.prisma.strategyVersion.findUnique({
      where: { id: request.strategyVersionId },
    });
    if (!version) throw new NotFoundException('策略版本不存在');
    const parsed = strategySchema.safeParse(version.schema);
    const strategy = parsed.success ? parsed.data as BacktestStrategy : undefined;
    if (
      version.schemaVersion !== 1 ||
      !strategy ||
      strategy.execution.mode !== 'exchange' ||
      strategy.executionInstrument.assetType === 'fund'
    )
      return {
        status: 'blocked',
        reasonCode: 'unsupported-strategy',
        message: '请先保存有效的股票或 ETF 策略；基金策略请使用净值回测入口。',
      };
    const instrument = strategy.executionInstrument;
    const configuredAt = new Date().toISOString();
    if (request.policy === 'research-defaults') {
      try {
        return backtestModelResolutionResultSchema.parse(
          strategyResearchExecutionModel(request, strategy, configuredAt),
        );
      } catch (error) {
        const message =
          error instanceof Error && !error.name.includes('Zod')
            ? error.message
            : '策略费用与回测设置不兼容，请核对策略配置。';
        return { status: 'blocked', reasonCode: 'rules-incompatible', message };
      }
    }
    let response;
    try {
      response = await this.dsa.backtestInstrumentFacts({
        symbol: instrument.symbol,
        market: instrument.market,
        instrumentType: instrument.assetType === 'stock' ? 'STOCK' : 'ETF',
        start: request.startDate,
        end: request.endDate,
        executionStart: request.startDate,
        executionEnd: request.endDate,
        dataAsOf: configuredAt,
      });
    } catch {
      return {
        status: 'blocked',
        reasonCode: 'rules-unavailable',
        message: '市场交易规则暂时无法读取，请稍后重试。',
      };
    }
    try {
      return backtestModelResolutionResultSchema.parse({
        status: 'available',
        policy: 'historical-rules',
        model: savedStrategyExecutionModel(request, strategy, response, configuredAt),
      });
    } catch (error) {
      const message =
        error instanceof Error && !error.name.includes('Zod')
          ? error.message
          : '该标的的市场规则暂不支持自动配置回测，请更新规则数据后重试。';
      return { status: 'blocked', reasonCode: 'rules-incompatible', message };
    }
  }
}

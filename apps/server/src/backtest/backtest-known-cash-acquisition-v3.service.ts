import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { KnownCashAcquisitionInputV3 } from './backtest-run-preparation-protocol-v3.js';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { MarketControlService } from '../market/market-control.service.js';
import { selectMarketKnownCashV3 } from '../market/market-known-cash-selector-v3.js';
import { prepareKnownCashResearchV3 } from './backtest-known-cash-preparation-v3.js';
import { BacktestKnownCashPreparationRepository } from './backtest-known-cash-preparation.repository.js';
import { BacktestKnownCashGuardV3 } from './backtest-known-cash-guard-v3.service.js';
import { isDeepStrictEqual } from 'node:util';

@Injectable()
export class BacktestKnownCashAcquisitionV3 {
  constructor(
    @Inject(DsaClient) private readonly dsa: DsaClient,
    @Inject(MarketControlService) private readonly control: MarketControlService,
    @Inject(BacktestKnownCashPreparationRepository)
    private readonly originals: BacktestKnownCashPreparationRepository,
  ) {}

  async acquire(input: KnownCashAcquisitionInputV3) {
    const { request, executionPriceProtocol, revisions } = input;
    if (!request.knownCashResearch) throw new Error('缺少已知现金方案的显式研究选择');
    const researchPolicy = {
      ...request.knownCashResearch,
      entitlement: 'cn-etf-record-close-holdings-v2' as const,
      uncertainRecords: request.knownCashResearch.uncertainRecords ?? ('exclude' as const),
    };
    if (request.reuseResearchData) {
      const original = await this.originals.read(request.reuseResearchData.cashPreparationHash);
      const scope = original.input.scope;
      if (
        scope.symbol !== request.runConfig.executionModel.scope.symbol ||
        scope.startDate !== request.runConfig.startDate ||
        scope.endDate !== request.runConfig.endDate ||
        !isDeepStrictEqual(original.input.policy, researchPolicy) ||
        !isDeepStrictEqual(original.input.executionPriceProtocol, executionPriceProtocol) ||
        !isDeepStrictEqual(original.input.revisions, revisions)
      )
        throw new Error('已有研究数据与新准备的范围、policy、价格协议或控制修订不一致');
      await new BacktestKnownCashGuardV3(this.originals, this.dsa).check(original);
      return original;
    }
    const prepared = await prepareKnownCashResearchV3({
      scope: {
        contractVersion: 3,
        protocolVersion: 'known-cash-observations-v1',
        requestId: randomUUID(),
        symbol: request.runConfig.executionModel.scope.symbol,
        routeKey: { kind: 'data', market: 'CN', assetType: 'ETF', capability: 'CASH_DISTRIBUTION' },
        ...revisions,
        start: request.runConfig.startDate,
        end: request.runConfig.endDate,
        currency: 'CNY',
        researchPolicy,
      },
      clock:
        request.freezeTimePolicy === 'after-acquisition'
          ? {
              mode: 'after-acquisition',
              requestedDataAsOf: request.runConfig.dataAsOf,
              readDeadlineAt: new Date(Date.now() + 60_000).toISOString(),
            }
          : { mode: 'requested-time', requestedDataAsOf: request.runConfig.dataAsOf },
      executionPriceProtocol,
      read: async (scope) => {
        const [policy, catalog] = await Promise.all([
          this.control.getPolicy(),
          this.dsa.marketRouteCatalogV3(),
        ]);
        const effective = (policy as { effectiveProjection?: unknown }).effectiveProjection;
        const selected = await selectMarketKnownCashV3({
          scope,
          effective,
          catalog,
          read: (candidate) => this.dsa.dataCapabilities.knownCash(candidate),
        });
        if (selected.status !== 'observed') {
          const reasons = selected.attempts
            .map((attempt) => `${attempt.target.providerId}/${attempt.reason ?? 'unknown'}`)
            .join('、');
          throw new Error(
            `已知现金资料未取得：${selected.reason}${reasons ? `（${reasons}）` : ''}`,
          );
        }
        return { request: selected.request, response: selected.response };
      },
    });
    await this.originals.save(prepared);
    return prepared;
  }
}

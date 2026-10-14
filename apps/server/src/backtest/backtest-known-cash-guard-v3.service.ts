import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { BacktestKnownCashPreparationV3 } from '@thesis-ledger/schemas';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { BacktestKnownCashPreparationRepository } from './backtest-known-cash-preparation.repository.js';

@Injectable()
export class BacktestKnownCashGuardV3 {
  constructor(
    @Inject(BacktestKnownCashPreparationRepository)
    private readonly originals: BacktestKnownCashPreparationRepository,
    @Inject(DsaClient) private readonly dsa: DsaClient,
  ) {}

  async check(prepared: BacktestKnownCashPreparationV3) {
    const original = await this.originals.assertOriginal(prepared);
    const expectedControlIdentity = original.input.source.controlIdentity;
    if (!expectedControlIdentity) throw new Error('生产准备缺少现金控制身份');
    return this.dsa.dataCapabilities.knownCashControl({
      ...original.acquisition.exchange.request,
      protocolVersion: 'known-cash-control-v1',
      requestId: randomUUID(),
      expectedControlIdentity,
    });
  }
}

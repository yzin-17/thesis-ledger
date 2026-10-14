import { Inject, Injectable, Optional } from '@nestjs/common';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import {
  MarketLifecycleReaderV3,
  type MarketLifecycleReadPortV3,
} from '../market/market-lifecycle-reader-v3.js';
import { MarketBarReader } from '../market/market-bar-reader.js';
import { MarketPitReconstructionRepository } from '../market/market-pit-reconstruction.repository.js';
import type { BacktestReconstructionPreflightPortV3 } from './backtest-reconstruction-preflight-v3.js';
import { LocalSnapshotStore } from './backtest-snapshot.js';
import {
  buildBacktestSnapshotV3,
  type BacktestSnapshotV3BuildInput,
  type BacktestSnapshotV3BuildResult,
} from './backtest-snapshot-v3-builder.js';
import type { BacktestSnapshotBuilder } from './backtest-run.service.js';
import { BacktestKnownCashGuardV3 } from './backtest-known-cash-guard-v3.service.js';

@Injectable()
export class DsaSnapshotBuilder implements BacktestSnapshotBuilder {
  constructor(
    private readonly dsa: DsaClient,
    private readonly snapshots: LocalSnapshotStore,
    @Inject(MarketBarReader)
    private readonly bars: Pick<MarketBarReader, 'readV3'>,
    @Inject(MarketPitReconstructionRepository)
    private readonly reconstruction?: BacktestReconstructionPreflightPortV3,
    @Optional()
    @Inject(MarketLifecycleReaderV3)
    private readonly lifecycle?: MarketLifecycleReadPortV3,
    @Optional()
    @Inject(BacktestKnownCashGuardV3)
    private readonly knownCash?: BacktestKnownCashGuardV3,
  ) {}

  async buildV3(input: BacktestSnapshotV3BuildInput): Promise<BacktestSnapshotV3BuildResult> {
    const prepared = input.runConfig.knownCashPreparation;
    return buildBacktestSnapshotV3(
      input,
      this.snapshots.v3,
      { readV3: this.bars.readV3.bind(this.bars) },
      this.dsa,
      this.reconstruction,
      this.lifecycle,
      prepared
        ? async () => {
            if (!this.knownCash) throw new Error('缺少现金原包及当前控制复核端口');
            return this.knownCash.check(prepared);
          }
        : undefined,
    );
  }
}

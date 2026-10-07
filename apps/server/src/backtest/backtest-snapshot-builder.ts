import { Inject, Injectable } from '@nestjs/common';
import { DsaClient } from '../integration/dsa/dsa.client.js';
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

@Injectable()
export class DsaSnapshotBuilder implements BacktestSnapshotBuilder {
  constructor(
    private readonly dsa: DsaClient,
    private readonly snapshots: LocalSnapshotStore,
    @Inject(MarketBarReader)
    private readonly bars: Pick<MarketBarReader, 'readV3'>,
    @Inject(MarketPitReconstructionRepository)
    private readonly reconstruction?: BacktestReconstructionPreflightPortV3,
  ) {}

  async buildV3(input: BacktestSnapshotV3BuildInput): Promise<BacktestSnapshotV3BuildResult> {
    return buildBacktestSnapshotV3(
      input,
      this.snapshots.v3,
      { readV3: this.bars.readV3.bind(this.bars) },
      this.dsa,
      this.reconstruction,
    );
  }
}

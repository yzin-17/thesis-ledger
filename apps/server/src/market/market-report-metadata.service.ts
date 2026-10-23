import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { reportMetadataCollectSchema } from '@thesis-ledger/schemas';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { readReportMetadata } from '../integration/dsa/dsa-report-metadata.js';
import { InstrumentService } from './instrument.service.js';
import { MarketReportMetadataRepository } from './market-report-metadata.repository.js';

@Injectable()
export class MarketReportMetadataService {
  constructor(
    @Inject(InstrumentService) private readonly instruments: InstrumentService,
    @Inject(DsaClient) private readonly dsa: DsaClient,
    @Inject(MarketReportMetadataRepository) private readonly snapshots: MarketReportMetadataRepository,
  ) {}

  async collect(input: unknown) {
    const checked = reportMetadataCollectSchema.safeParse(input);
    if (!checked.success) throw new BadRequestException('研报采集需要有效目录身份、可选日期筛选与有界分页');
    const { instrumentId, ...query } = checked.data;
    const identity = await this.instruments.resolveCanonicalIdentity(instrumentId);
    if (identity.market !== 'CN' || identity.assetType !== 'STOCK' || !/^[0-9]{6}\.(SH|SZ)$/.test(identity.symbol))
      throw new BadRequestException('当前研报元数据只接收目录中的沪深股票');
    const request = {
      ...query, contractVersion: 3 as const, consumer: 'thesis-ledger' as const,
      requestId: randomUUID(), symbol: identity.symbol, assetType: 'STOCK' as const,
    };
    const page = await readReportMetadata(this.dsa, request);
    return this.snapshots.record(instrumentId, request, page);
  }
}

import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { assetTypeForInstrument, symbolForInstrument } from './instruments/instrument-search.js';
import { PrismaService } from '../platform/prisma.service.js';
import { InstrumentAssociationService } from './instruments/instrument-association.service.js';
import { InstrumentSearchService } from './instruments/instrument-search.service.js';
import { CatalogSyncService } from './instruments/catalog-sync.service.js';

export { instrumentMatchRank } from './instruments/instrument-search.js';

@Injectable()
export class InstrumentService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly catalogSync?: CatalogSyncService,
    @Optional() private readonly instrumentSearch?: InstrumentSearchService,
    @Optional() private readonly association?: InstrumentAssociationService,
  ) {}

  private catalog() {
    return this.catalogSync ?? new CatalogSyncService(this.prisma);
  }

  private searcher() {
    return this.instrumentSearch ?? new InstrumentSearchService(this.prisma);
  }

  private associationsService() {
    return this.association ?? new InstrumentAssociationService(this.prisma);
  }

  syncCatalog(raw: unknown) {
    return this.catalog().syncCatalog(raw);
  }

  applyCatalogDelta(raw: unknown) {
    return this.catalog().applyCatalogDelta(raw);
  }

  search(query: string, limit = 20) {
    return this.searcher().search(query, limit);
  }

  confirm(instrumentId: string) {
    return this.associationsService().confirm(instrumentId);
  }

  requireConfirmed(instrumentId: string) {
    return this.associationsService().requireConfirmed(instrumentId);
  }

  async resolveTradableInstrument(instrumentId: string) {
    const instrument = await this.prisma.instrument.findUnique({ where: { id: instrumentId } });
    if (!instrument) throw new NotFoundException('目录标的不存在');
    if (!instrument.active) throw new BadRequestException('目录标的已失效，请重新选择');
    if (!['SH', 'SZ', 'BJ', 'OF', 'HK', 'US'].includes(instrument.market) || !['STOCK', 'ETF', 'MUTUAL_FUND'].includes(instrument.instrumentType))
      throw new BadRequestException('目录标的类型或市场不在当前支持范围');
    const market = ['SH', 'SZ', 'BJ', 'OF'].includes(instrument.market) ? 'CN' : instrument.market;
    return { market, symbol: symbolForInstrument(instrument), assetType: assetTypeForInstrument(instrument.instrumentType) };
  }

  latestGeneration() {
    return this.catalog().latestGeneration();
  }

  markCatalogChecked(generation: number, checksum: string) {
    return this.catalog().markCatalogChecked(generation, checksum);
  }

  associations(symbol?: string) {
    return this.associationsService().associations(symbol);
  }
}

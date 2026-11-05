import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { assetTypeForInstrument, symbolForInstrument } from './instruments/instrument-search.js';
import { PrismaService } from '../platform/prisma.service.js';
import { InstrumentAssociationService } from './instruments/instrument-association.service.js';
import { InstrumentSearchService } from './instruments/instrument-search.service.js';
import { CatalogSyncService } from './instruments/catalog-sync.service.js';
import { currencyForMarket, marketNewsRequestV3Schema, type MarketNewsRequestV3 } from '@thesis-ledger/schemas';
import type { Prisma } from '@prisma/client';
import { InstrumentDirectoryService } from './instruments/instrument-directory.service.js';

export { instrumentMatchRank } from './instruments/instrument-search.js';

@Injectable()
export class InstrumentService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly catalogSync?: CatalogSyncService,
    @Optional() private readonly instrumentSearch?: InstrumentSearchService,
    @Optional() private readonly association?: InstrumentAssociationService,
    @Optional() private readonly instrumentDirectory?: InstrumentDirectoryService,
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

  /** 只读规范身份，不创建 Asset 或持仓关联。 */
  async resolveCanonicalIdentity(instrumentId: string, transaction?: Prisma.TransactionClient) {
    const record = await (transaction ?? this.prisma).instrument.findUnique({ where: { id: instrumentId } });
    if (!record || !record.active) throw new NotFoundException('目录标的不存在或已失效');
    let market: 'CN' | 'HK' | 'US';
    if (['SH', 'SZ', 'BJ', 'OF'].includes(record.market)) market = 'CN';
    else if (record.market === 'HK' || record.market === 'US') market = record.market;
    else throw new BadRequestException('目录标的市场暂不支持');
    const assetType = record.instrumentType;
    if (assetType !== 'STOCK' && assetType !== 'ETF' && assetType !== 'INDEX' && assetType !== 'MUTUAL_FUND') throw new BadRequestException('目录标的类型暂不支持');
    const identity: MarketNewsRequestV3['instrument'] = { market, assetType, symbol: symbolForInstrument(record) };
    if (!marketNewsRequestV3Schema.shape.instrument.safeParse(identity).success) throw new BadRequestException('目录标的规范代码无效');
    return { ...identity, instrumentId: record.id, currency: currencyForMarket[market], catalogGeneration: record.generation };
  }

  async resolveCanonicalSymbols(symbols: readonly string[], transaction?: Prisma.TransactionClient) {
    const directory = await (this.instrumentDirectory ?? new InstrumentDirectoryService(this.prisma)).resolveSymbols(symbols, transaction);
    const unresolved = [...directory.unresolvedSymbols];
    const items = await Promise.all(directory.items.map(async (item) => {
      const record = await (transaction ?? this.prisma).instrument.findUnique({ where: { canonicalCode_instrumentType_market: { canonicalCode: item.canonicalCode, instrumentType: item.instrumentType, market: item.market } } });
      if (!record || !record.active) { unresolved.push(item.symbol); return null; }
      try { return await this.resolveCanonicalIdentity(record.id, transaction); }
      catch (error) { if (error instanceof BadRequestException || error instanceof NotFoundException) { unresolved.push(item.symbol); return null; } throw error; }
    }));
    return { items: items.filter((item): item is NonNullable<typeof item> => item !== null), unresolvedSymbols: [...new Set(unresolved)].sort() };
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

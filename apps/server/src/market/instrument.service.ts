import { Injectable, Optional } from '@nestjs/common';
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

  latestGeneration() {
    return this.catalog().latestGeneration();
  }

  associations(symbol?: string) {
    return this.associationsService().associations(symbol);
  }
}

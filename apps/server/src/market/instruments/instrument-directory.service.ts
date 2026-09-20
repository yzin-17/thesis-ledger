import { Injectable, Logger } from '@nestjs/common';
import {
  instrumentDirectorySchema,
  type InstrumentDirectory,
  type InstrumentDirectoryItem,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../../platform/prisma.service.js';

type ParsedSymbol = {
  symbol: string;
  canonicalCode: string;
  market: string;
};

type CatalogInstrument = {
  id: string;
  canonicalCode: string;
  instrumentType: string;
  market: string;
  displayName: string;
  generation: number;
  active: boolean;
  updatedAt: Date;
};

const parseSymbol = (value: string): ParsedSymbol | null => {
  const symbol = value.trim().toUpperCase();
  const separator = symbol.lastIndexOf('.');
  if (separator <= 0 || separator === symbol.length - 1) return null;
  const canonicalCode = symbol.slice(0, separator).trim();
  const market = symbol.slice(separator + 1).trim();
  if (!canonicalCode || !market) return null;
  return { symbol: `${canonicalCode}.${market}`, canonicalCode, market };
};

const uniqueSymbols = (symbols: readonly string[]) =>
  [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))].sort();

const rank = (instrument: CatalogInstrument) => ({
  active: instrument.active ? 1 : 0,
  generation: instrument.generation,
  updatedAt: instrument.updatedAt.getTime(),
});

const sameRank = (left: CatalogInstrument, right: CatalogInstrument) => {
  const leftRank = rank(left);
  const rightRank = rank(right);
  return (
    leftRank.active === rightRank.active &&
    leftRank.generation === rightRank.generation &&
    leftRank.updatedAt === rightRank.updatedAt
  );
};

const sortCandidates = (left: CatalogInstrument, right: CatalogInstrument) => {
  const leftRank = rank(left);
  const rightRank = rank(right);
  return (
    rightRank.active - leftRank.active ||
    rightRank.generation - leftRank.generation ||
    rightRank.updatedAt - leftRank.updatedAt ||
    left.id.localeCompare(right.id)
  );
};

const emptyDirectory = (symbols: readonly string[], generation = 0): InstrumentDirectory =>
  instrumentDirectorySchema.parse({
    generation,
    items: [],
    unresolvedSymbols: uniqueSymbols(symbols),
  });

@Injectable()
export class InstrumentDirectoryService {
  private readonly logger = new Logger(InstrumentDirectoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolveSymbols(symbols: readonly string[]): Promise<InstrumentDirectory> {
    const normalizedSymbols = uniqueSymbols(symbols);
    const parsedSymbols = normalizedSymbols
      .map(parseSymbol)
      .filter((value): value is ParsedSymbol => value !== null);
    const parseUnresolved = normalizedSymbols.filter(
      (symbol) => !parsedSymbols.some((parsed) => parsed.symbol === symbol),
    );

    if (parsedSymbols.length === 0) return emptyDirectory(parseUnresolved);

    try {
      const [instruments, syncState] = await Promise.all([
        this.prisma.instrument.findMany({
          where: {
            OR: parsedSymbols.map(({ canonicalCode, market }) => ({ canonicalCode, market })),
          },
          select: {
            id: true,
            canonicalCode: true,
            instrumentType: true,
            market: true,
            displayName: true,
            generation: true,
            active: true,
            updatedAt: true,
          },
          orderBy: [{ active: 'desc' }, { generation: 'desc' }, { updatedAt: 'desc' }],
        }),
        this.prisma.catalogSyncState.findUnique({
          where: { consumer: 'thesis-ledger' },
          select: { generation: true },
        }),
      ]);

      const candidatesBySymbol = new Map<string, CatalogInstrument[]>();
      for (const instrument of instruments as CatalogInstrument[]) {
        const symbol = `${instrument.canonicalCode}.${instrument.market}`.toUpperCase();
        const candidates = candidatesBySymbol.get(symbol) ?? [];
        candidates.push(instrument);
        candidatesBySymbol.set(symbol, candidates);
      }

      const items: InstrumentDirectoryItem[] = [];
      const unresolvedSymbols = [...parseUnresolved];
      for (const parsed of parsedSymbols) {
        const candidates = [...(candidatesBySymbol.get(parsed.symbol) ?? [])].sort(sortCandidates);
        const best = candidates[0];
        if (!best) {
          unresolvedSymbols.push(parsed.symbol);
          continue;
        }
        const bestRankCandidates = candidates.filter((candidate) => sameRank(candidate, best));
        if (new Set(bestRankCandidates.map((candidate) => candidate.displayName)).size > 1) {
          unresolvedSymbols.push(parsed.symbol);
          continue;
        }
        items.push({
          symbol: parsed.symbol,
          canonicalCode: best.canonicalCode,
          instrumentType: best.instrumentType,
          market: best.market,
          displayName: best.displayName,
          active: best.active,
        });
      }

      return instrumentDirectorySchema.parse({
        generation: syncState?.generation ?? 0,
        items: items.sort((left, right) => left.symbol.localeCompare(right.symbol)),
        unresolvedSymbols: [...new Set(unresolvedSymbols)].sort(),
      });
    } catch (error) {
      this.logger.warn(
        `标的目录解析失败，业务读取将回退为代码: ${error instanceof Error ? error.message : String(error)}`,
      );
      return emptyDirectory(normalizedSymbols);
    }
  }
}

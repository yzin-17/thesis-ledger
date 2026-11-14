import { Injectable, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { keyBy } from 'es-toolkit';
import { PrismaService } from '../../platform/prisma.service.js';
import { InstrumentDirectoryService } from './instrument-directory.service.js';

export type InstrumentDisplayNames = {
  generation: number;
  name: (symbol: string) => string;
};

/** 当前展示名称的读取边界；冻结记录应在生成时解析，读取时保留原值。 */
@Injectable()
export class InstrumentDisplayService {
  constructor(
    prisma: PrismaService,
    @Optional()
    private readonly directory: InstrumentDirectoryService = new InstrumentDirectoryService(prisma),
  ) {}

  resolveDirectory(symbols: readonly string[], transaction?: Prisma.TransactionClient) {
    return this.directory.resolveSymbols(symbols, transaction);
  }

  async resolve(
    symbols: readonly string[],
    transaction?: Prisma.TransactionClient,
  ): Promise<InstrumentDisplayNames> {
    const directory = await this.resolveDirectory(symbols, transaction);
    const bySymbol = keyBy(directory.items, (item) => item.symbol);
    return {
      generation: directory.generation,
      name: (symbol) => {
        const normalized = symbol.trim().toUpperCase();
        return bySymbol[normalized]?.displayName ?? normalized;
      },
    };
  }

  async nameAssets<T extends { symbol: string; asset: { name: string } }>(
    rows: readonly T[],
    transaction?: Prisma.TransactionClient,
  ): Promise<T[]> {
    const names = await this.resolve(
      rows.map((row) => row.symbol),
      transaction,
    );
    return rows.map((row) => ({
      ...row,
      asset: { ...row.asset, name: names.name(row.symbol) },
    }));
  }
}

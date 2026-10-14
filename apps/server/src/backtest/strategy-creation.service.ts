import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  strategySchema,
  strategyVersionProvenanceSchema,
  type StrategyVersionProvenance,
} from '@thesis-ledger/schemas';
import { hashCanonicalManifest } from './backtest-snapshot.js';

@Injectable()
export class StrategyCreationService {
  definitionFingerprint(definition: unknown) {
    return hashCanonicalManifest(strategySchema.parse(definition));
  }
  createInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      ownerId: string | null;
      name: string;
      description?: string | undefined;
      definition: unknown;
      source: StrategyVersionProvenance;
    },
  ) {
    if (input.ownerId !== null) z.uuid().parse(input.ownerId);
    const definition = strategySchema.parse(input.definition);
    const source = strategyVersionProvenanceSchema.parse(input.source);
    return tx.strategy.create({
      data: {
        name: z.string().trim().min(1).max(200).parse(input.name),
        ownerId: input.ownerId,
        description: input.description ?? definition.description ?? null,
        status: 'draft',
        schemaVersion: 2,
        versions: {
          create: {
            version: 1,
            schemaVersion: 2,
            schema: definition as Prisma.InputJsonValue,
            source,
          },
        },
      },
      include: { versions: true },
    });
  }
}

import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  assessMarketRouteCompatibilityV3,
  marketRouteCompatibilityObservationV3Schema,
  marketRouteCompatibilityProofV3Schema,
  type MarketRouteCompatibilityObservationV3,
} from '@thesis-ledger/schemas';
import { loadConfig } from '../platform/config.js';

const revision = z.number().int().positive();
const entrySchema = z.strictObject({
  desiredRevision: revision,
  effectivePolicyRevision: revision,
  catalogRevision: revision,
  proof: marketRouteCompatibilityProofV3Schema,
  observation: marketRouteCompatibilityObservationV3Schema,
});
export const marketChartProofPackageSchema = z.strictObject({
  contractVersion: z.literal(3),
  entries: z.array(entrySchema).max(100),
});
export type ChartProofLookup = Pick<
  MarketRouteCompatibilityObservationV3,
  'routeKey' | 'symbol' | 'window' | 'targets'
> & {
  desiredRevision: number;
  effectivePolicyRevision: number;
  catalogRevision: number;
};
const MAX_BYTES = 1_048_576;

/** Read-only deployment evidence; no HTTP writer and no stale evidence cache. */
@Injectable()
export class MarketChartProofRepository {
  async findExact(input: ChartProofLookup) {
    try {
      const config = loadConfig();
      if (!config.marketChartCompatibilityFile || !config.marketChartCompatibilitySha256)
        return null;
      const file = await open(
        config.marketChartCompatibilityFile,
        constants.O_RDONLY | constants.O_NONBLOCK,
      );
      let bytes: Buffer;
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > MAX_BYTES) return null;
        const buffer = Buffer.alloc(MAX_BYTES + 1);
        let offset = 0;
        while (offset < buffer.length) {
          const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, null);
          if (bytesRead === 0) break;
          offset += bytesRead;
        }
        if (offset > MAX_BYTES) return null;
        bytes = buffer.subarray(0, offset);
      } finally {
        await file.close();
      }
      if (
        createHash('sha256').update(bytes).digest('hex') !== config.marketChartCompatibilitySha256
      )
        return null;
      const bundle = marketChartProofPackageSchema.parse(JSON.parse(bytes.toString('utf8')));
      const now = new Date().toISOString();
      const matches = bundle.entries.filter((entry) => {
        if (
          entry.desiredRevision !== input.desiredRevision ||
          entry.effectivePolicyRevision !== input.effectivePolicyRevision ||
          entry.catalogRevision !== input.catalogRevision ||
          entry.proof.verification.kind !== 'verified-equivalence'
        )
          return false;
        return [
          entry.observation,
          {
            ...entry.observation,
            routeKey: input.routeKey,
            symbol: input.symbol,
            window: input.window,
            targets: input.targets,
          },
        ].every(
          (observation) =>
            assessMarketRouteCompatibilityV3({ proof: entry.proof, observation, now }).eligible,
        );
      });
      if (matches.length !== 1) return null;
      const entry = matches[0]!;
      return { proof: entry.proof, observation: entry.observation };
    } catch {
      return null;
    }
  }
}

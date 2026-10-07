import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { Inject, Injectable } from '@nestjs/common';
import { loadConfig } from '../platform/config.js';
import { MarketWindowEvidenceV3Repository } from './market-window-evidence-v3.repository.js';
import {
  bindMarketPitArchiveContentV3,
  type MarketPitReconstructionInputV3,
} from './market-pit-reconstruction-content-v3.js';
import { bindMarketPitSourceTimesV3 } from './market-pit-reconstruction-source-times-v3.js';

const MAX_BYTES = 33_554_432;

/** 部署只读清单与原文摘要；不缓存撤销结果，不提供 HTTP 写入。 */
@Injectable()
export class MarketPitReconstructionRepository {
  constructor(
    @Inject(MarketWindowEvidenceV3Repository)
    private readonly windows: MarketWindowEvidenceV3Repository,
  ) {}

  async bindSourceTimes(input: MarketPitReconstructionInputV3, reconstructionRef: string) {
    const content = await this.bindContent(input, reconstructionRef);
    if (!content) return null;
    const result = bindMarketPitSourceTimesV3(content);
    if (result.status !== 'source-times-bound') return result;
    return { ...content, status: result.status, sourceTimeBindings: result.bindings };
  }

  async bindContent(input: MarketPitReconstructionInputV3, reconstructionRef: string) {
    try {
      const config = loadConfig();
      if (
        !config.marketPitReconstructionFile ||
        !config.marketPitReconstructionSha256 ||
        reconstructionRef !== `market-pit-proof-v1:${config.marketPitReconstructionSha256}`
      )
        return null;
      const file = await open(
        config.marketPitReconstructionFile,
        constants.O_RDONLY | constants.O_NONBLOCK,
      );
      let bytes: Buffer;
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size === 0 || stat.size > MAX_BYTES) return null;
        const buffer = Buffer.alloc(stat.size + 1);
        let offset = 0;
        while (offset < buffer.length) {
          const read = await file.read(buffer, offset, buffer.length - offset, null);
          if (read.bytesRead === 0) break;
          offset += read.bytesRead;
        }
        if (offset > stat.size) return null;
        bytes = buffer.subarray(0, offset);
      } finally {
        await file.close();
      }
      const manifestHash = createHash('sha256').update(bytes).digest('hex');
      if (manifestHash !== config.marketPitReconstructionSha256) return null;
      const manifestText = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      const content = await bindMarketPitArchiveContentV3(
        { ...input, proof: JSON.parse(manifestText) },
        this.windows,
      );
      if (content.status !== 'archives-bound') return null;
      return { ...content, reconstructionRef, manifestText, manifestHash };
    } catch {
      return null;
    }
  }
}

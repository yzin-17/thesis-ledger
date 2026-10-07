import { Prisma, type MarketBarWindowEvidenceV3 } from '@prisma/client';
import type { PrismaService } from '../platform/prisma.service.js';

type EvidenceWrite = Prisma.MarketBarWindowEvidenceV3CreateInput & {
  completeResponseHash: string;
};

export const insertMarketWindowEvidenceV3 = async (
  prisma: PrismaService,
  data: EvidenceWrite,
): Promise<MarketBarWindowEvidenceV3 | null> => {
  // Prisma ORM 的 Json 参数可能改变浮点位模式；JSON 文本参数保留响应摘要所绑定的数值。
  const rows = await prisma.$queryRaw<MarketBarWindowEvidenceV3[]>(Prisma.sql`
    INSERT INTO "MarketBarWindowEvidenceV3" (
      "identityFingerprint", "routeKind", "market", "assetType", "capability", "timeframe",
      "adjustment", "symbol", "providerId", "upstreamSource", "routeIndex",
      "requestedStart", "requestedEnd", "seriesVersion", "inputFingerprint",
      "desiredRevision", "effectivePolicyRevision", "catalogRevision",
      "sourcePriceBasis", "coverageProof", "completeResponse", "completeResponseHash", "fetchedAt"
    ) VALUES (
      ${data.identityFingerprint}, ${data.routeKind}, ${data.market}, ${data.assetType},
      ${data.capability}, ${data.timeframe}, ${data.adjustment}, ${data.symbol},
      ${data.providerId}, ${data.upstreamSource}, ${data.routeIndex},
      ${data.requestedStart}::date, ${data.requestedEnd}::date,
      ${data.seriesVersion}, ${data.inputFingerprint}, ${data.desiredRevision},
      ${data.effectivePolicyRevision}, ${data.catalogRevision},
      ${JSON.stringify(data.sourcePriceBasis)}::jsonb, ${JSON.stringify(data.coverageProof)}::jsonb,
      ${JSON.stringify(data.completeResponse)}::jsonb, ${data.completeResponseHash}, ${data.fetchedAt}
    ) ON CONFLICT ("identityFingerprint") DO NOTHING
    RETURNING *
  `);
  if (rows.length > 1) throw new Error('行情窗口证据插入返回多行');
  return rows[0] ?? null;
};

export const backfillMarketWindowEvidenceV3 = (
  prisma: PrismaService,
  identityFingerprint: string,
  response: unknown,
  completeResponseHash: string,
): Promise<number> =>
  prisma.$executeRaw(Prisma.sql`
    UPDATE "MarketBarWindowEvidenceV3"
    SET "completeResponse" = ${JSON.stringify(response)}::jsonb,
        "completeResponseHash" = ${completeResponseHash}
    WHERE "identityFingerprint" = ${identityFingerprint}
      AND "completeResponse" IS NULL AND "completeResponseHash" IS NULL
  `);

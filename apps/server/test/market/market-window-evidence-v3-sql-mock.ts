import type { Prisma } from '@prisma/client';

const insertColumns = [
  'identityFingerprint',
  'routeKind',
  'market',
  'assetType',
  'capability',
  'timeframe',
  'adjustment',
  'symbol',
  'providerId',
  'upstreamSource',
  'routeIndex',
  'requestedStart',
  'requestedEnd',
  'seriesVersion',
  'inputFingerprint',
  'desiredRevision',
  'effectivePolicyRevision',
  'catalogRevision',
  'sourcePriceBasis',
  'coverageProof',
  'completeResponse',
  'completeResponseHash',
  'fetchedAt',
] as const;

export const decodeMarketWindowEvidenceInsert = (
  statement: Prisma.Sql,
): Record<string, unknown> => {
  if (statement.values.length !== insertColumns.length) throw new Error('插入参数数量不匹配');
  return Object.fromEntries(
    insertColumns.map((column, index) => {
      const value = statement.values[index];
      return [
        column,
        ['sourcePriceBasis', 'coverageProof', 'completeResponse'].includes(column)
          ? JSON.parse(value as string)
          : value,
      ];
    }),
  );
};

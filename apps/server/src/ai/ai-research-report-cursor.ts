import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { researchReportSelection, type ResearchReportListQuery } from '@thesis-ledger/schemas';

const cursorSchema = z.strictObject({
  version: z.literal(1),
  updatedAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
  binding: z.string().regex(/^[a-f0-9]{64}$/u),
});
const binding = (ownerId: string, query: ResearchReportListQuery) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        ownerId,
        view: query.view,
        mode: query.view === 'scoped' ? query.mode : null,
        kind: query.view === 'scoped' ? (query.kind ?? null) : null,
        selection: researchReportSelection(query),
        search: query.search ?? null,
        status: query.status ?? null,
      }),
    )
    .digest('hex');
export function decodeResearchReportCursor(ownerId: string, query: ResearchReportListQuery) {
  if (!query.cursor) return null;
  try {
    const value = cursorSchema.parse(
      JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')),
    );
    if (value.binding !== binding(ownerId, query)) throw new Error('范围不一致');
    return { updatedAt: new Date(value.updatedAt), id: value.id };
  } catch {
    throw new BadRequestException('研究报告游标无效或属于其他查询范围');
  }
}
export function encodeResearchReportCursor(
  ownerId: string,
  query: ResearchReportListQuery,
  row: { updatedAt: Date; id: string },
) {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      updatedAt: row.updatedAt.toISOString(),
      id: row.id,
      binding: binding(ownerId, query),
    }),
  ).toString('base64url');
}

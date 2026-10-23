import { Prisma } from '@prisma/client';
import { researchReportSelection, type ResearchReportLocator } from '@thesis-ledger/schemas';

/** 只按已保存的服务端范围查找，旧 context 不参与可信模式推断。 */
export function researchReportWhere(
  ownerId: string,
  locator: ResearchReportLocator,
): Prisma.AiRunWhereInput {
  if (locator.view === 'legacy')
    return { researchOwnerId: null, researchSubmissionId: null, promptVersion: 'research-v1' };
  const filters: Prisma.AiRunWhereInput[] = [
    { researchScopeSnapshot: { path: ['mode'], equals: locator.mode } },
  ];
  const selected = researchReportSelection(locator);
  if (locator.kind)
    filters.push({ researchScopeSnapshot: { path: ['scope'], equals: locator.kind } });
  if (selected) {
    filters.push({ researchScopeSnapshot: { path: ['scope'], equals: selected.scope } });
    if (selected.scope === 'instrument')
      filters.push({
        researchScopeSnapshot: {
          path: ['instrument', 'instrumentId'],
          equals: selected.instrumentId,
        },
      });
    else if (selected.scope === 'position')
      filters.push(
        { researchScopeSnapshot: { path: ['accountId'], equals: selected.accountId } },
        { researchScopeSnapshot: { path: ['instrument', 'symbol'], equals: selected.symbol } },
      );
    else if (selected.scope === 'account')
      filters.push({ researchScopeSnapshot: { path: ['accountId'], equals: selected.accountId } });
    else if (selected.scope === 'strategy')
      filters.push({
        researchScopeSnapshot: { path: ['strategyVersionId'], equals: selected.strategyVersionId },
      });
    else
      filters.push({
        researchScopeSnapshot: {
          path: ['portfolioId'],
          equals: selected.portfolioId ?? Prisma.JsonNull,
        },
      });
  }
  return { researchOwnerId: ownerId, AND: filters };
}

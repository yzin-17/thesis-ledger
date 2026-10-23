import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  RESEARCH_MAX_NUMERIC_FIELDS_V2,
  type ResearchFrozenEvidenceV2,
  type ResearchPrivateMaterialV2,
} from '@thesis-ledger/schemas';
import { BadRequestException } from '@nestjs/common';

function materialReasons(material: ResearchPrivateMaterialV2) {
  const reasons = material.unresolvedSymbols.map((symbol) => `instrument_unresolved:${symbol}`);
  if (material.version === 'research-strategy-material-v2') return reasons;
  if (material.accounts.some((account) => account.currency === null))
    reasons.push('account_currency_unrecorded');
  if (material.positions.some((position) => position.currency === null))
    reasons.push('position_cost_currency_unrecorded');
  if (material.cashBalances.some((balance) => balance.currency === null))
    reasons.push('cash_currency_unrecorded');
  if (material.cashBalances.some((balance) => balance.completeness !== 'complete'))
    reasons.push('cash_balance_incomplete');
  if (material.cashBalances.some((balance) => balance.projectionStatus !== 'current'))
    reasons.push('cash_projection_unverified');
  if (
    material.scope !== 'position' &&
    material.accounts.some(
      (account) =>
        !material.cashBalances.some((balance) => balance.accountId === account.accountId),
    )
  )
    reasons.push('cash_balance_unrecorded');
  return reasons;
}

/** 不做估值/换汇；数值映射仅覆盖实际读取且单位、币种明确的原始字段。 */
export function privateResearchEvidence(
  material: ResearchPrivateMaterialV2,
  fetchedAt: string,
  reasons: string[],
): ResearchFrozenEvidenceV2 {
  const portfolio = material.version === 'research-portfolio-material-v2';
  const usable = !portfolio || material.accounts.length > 0;
  const numericFields: ResearchFrozenEvidenceV2['numericFields'] = [];
  if (portfolio) {
    for (const [index, position] of material.positions.entries()) {
      numericFields.push({
        fieldPath: `/positions/${index}/quantity`,
        unit: 'position-unit',
        currency: null,
      });
      if (position.currency)
        numericFields.push({
          fieldPath: `/positions/${index}/costPrice`,
          unit: 'cost-price-per-position-unit',
          currency: position.currency,
        });
    }
    for (const [index, balance] of material.cashBalances.entries()) {
      if (
        balance.currency === null ||
        balance.completeness !== 'complete' ||
        balance.projectionStatus !== 'current'
      )
        continue;
      for (const field of ['settledAmount', 'pendingReceivable', 'pendingPayable'])
        numericFields.push({
          fieldPath: `/cashBalances/${index}/${field}`,
          unit: 'money',
          currency: balance.currency,
        });
    }
  } else numericFields.push({ fieldPath: '/schemaVersion', unit: 'version', currency: null });
  if (numericFields.length > RESEARCH_MAX_NUMERIC_FIELDS_V2)
    throw new BadRequestException({
      code: 'RESEARCH_SCOPE_TOO_LARGE',
      message: '可引用数值超过本次准备预算，请缩小研究范围',
    });
  const sourceIds = portfolio
    ? material.accounts.map((account) => `account:${account.accountId}`)
    : [`strategy-version:${material.strategyVersionId}`];
  const missing = [...new Set([...reasons, ...materialReasons(material)])];
  if (!usable && !missing.length) missing.push('workspace_accounts_empty');
  let status: ResearchFrozenEvidenceV2['status'] = 'unavailable';
  if (usable) {
    status = 'available';
    if (missing.length) status = 'partial';
  }
  return {
    audit: {
      evidenceId: randomUUID(),
      fingerprint: '0'.repeat(64),
      kind: portfolio ? 'portfolio' : 'strategy',
      providerId: 'thesis-ledger',
      upstreamSource: portfolio ? 'workspace-ledger' : 'strategy-version',
      contractVersion: material.version,
      policyRevision: null,
      routeRevision: null,
      credentialRevision: null,
      sourceIds,
      sourceUrls: [],
      publishedAt: null,
      availableAt: fetchedAt,
      fetchedAt,
    },
    required: true,
    usable,
    status,
    data: usable ? z.json().parse(material) : null,
    numericFields,
    reasons: missing,
  };
}

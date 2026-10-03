import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { NavRunPreparationV3 } from './backtest-nav-preparation.js';
import {
  NavPreparationReceiptError,
  navPreparationReceiptContentChecksum,
  replayNavPreparationEvidence,
  validateNavPreparationReceipt,
  type NavPreparationReceiptRow,
} from './backtest-nav-preparation-receipt.js';
import { PrismaService } from '../platform/prisma.service.js';

export { validateNavPreparationReceipt } from './backtest-nav-preparation-receipt.js';
export { navPreparationReceiptContentChecksum } from './backtest-nav-preparation-receipt.js';
export type { NavPreparationReceiptRow } from './backtest-nav-preparation-receipt.js';
export { NavPreparationReceiptError } from './backtest-nav-preparation-receipt.js';

@Injectable()
export class BacktestNavPreparationRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async save(request: unknown, evidence: NavRunPreparationV3) {
    const verified = await replayNavPreparationEvidence(request, evidence);
    const checkedAtMs = Date.parse(verified.binding.checkedAt);
    const admissionExpiryMs = Date.parse(verified.selection.response.admission.validUntil);
    const expiresAtMs = Math.min(checkedAtMs + 15 * 60 * 1000, admissionExpiryMs);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= checkedAtMs) {
      throw new NavPreparationReceiptError(
        422,
        'NAV_PREPARATION_RECEIPT_INVALID',
        'NAV 准备证据的有效期无效，请重新准备',
      );
    }
    const expiresAt = new Date(expiresAtMs);
    const data = {
      id: randomUUID(),
      strategyVersionId: verified.binding.strategyVersionId,
      preparationHash: verified.binding.preparationHash,
      contentChecksum: navPreparationReceiptContentChecksum(request, verified),
      request: request as Prisma.InputJsonValue,
      evidence: verified as unknown as Prisma.InputJsonValue,
      expiresAt,
    } satisfies Prisma.NavBacktestPreparationUncheckedCreateInput;
    const row = await this.prisma.navBacktestPreparation.create({ data });
    return {
      preparationId: row.id,
      preparationHash: row.preparationHash,
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  async validate(row: NavPreparationReceiptRow) {
    return validateNavPreparationReceipt(row);
  }
}

import { Prisma } from '@prisma/client';
import type { PrismaService } from '../platform/prisma.service.js';

/** Retain history; suppress still-pending events from a disabled/old rule. */
export const cancelInactiveRiskDeliveries = (db: PrismaService, id?: string) =>
  db.$executeRaw(Prisma.sql`
  UPDATE "NotificationDelivery" AS delivery
  SET "status"='cancelled', "errorCode"='risk_rule_inactive',
      "lastError"='风险规则已停用、归档、修订或尚未生效，取消待发提醒'
  FROM "RiskEvent" AS event
  JOIN "RiskRule" AS rule ON rule."id"=event."ruleId"
  WHERE delivery."subjectType"='risk-event' AND delivery."subjectId"=event."id"::text
    AND delivery."status" IN ('pending', 'retrying')
    ${id ? Prisma.sql`AND delivery."id"=${id}::uuid` : Prisma.empty}
    AND (rule."enabled"=false OR rule."archivedAt" IS NOT NULL OR rule."needsRepair"=true
      OR rule."version" <> event."ruleVersion" OR rule."effectiveAt">CURRENT_TIMESTAMP)
`);

import { randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  type ResearchObservationSubmission,
  type ResearchObservationVersion,
} from '@prisma/client';
import {
  researchObservationAttemptSchema,
  researchObservationEvaluationSchema,
  researchObservationInputsSchema,
  researchObservationVersionSchema,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { observationIdentity, researchObservationDigest } from './research-observation-identity.js';

const ATTEMPT_MS = 30_000;
type AttemptRow = ResearchObservationSubmission & { version: ResearchObservationVersion | null };
function projectVersion(row: ResearchObservationVersion) {
  const payload = row.payload as Prisma.JsonObject;
  return researchObservationVersionSchema.parse({
    id: row.id,
    observationId: row.observationId,
    inputFingerprint: row.inputFingerprint,
    recordedAt: row.createdAt.toISOString(),
    inputs: payload.inputs,
    evaluation: payload.evaluation,
  });
}
function projectAttempt(row: AttemptRow) {
  return researchObservationAttemptSchema.parse({
    submissionId: row.submissionId,
    observationId: row.observationId,
    state: row.state,
    expiresAt: row.expiresAt.toISOString(),
    errorCode: row.errorCode,
    version: row.version ? projectVersion(row.version) : null,
  });
}

/** 只维护观察及提交事实；读取权限在调用方使用保存的报告范围核验。 */
@Injectable()
export class ResearchObservationStore {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async begin(raw: unknown) {
    const identity = observationIdentity(raw);
    const now = new Date();
    const attemptId = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      await tx.researchObservation.createMany({
        skipDuplicates: true,
        data: [{ id: randomUUID(), ...identity.logical, logicalKey: identity.logicalKey }],
      });
      const observation = await tx.researchObservation.findUniqueOrThrow({
        where: { logicalKey: identity.logicalKey },
      });
      await tx.researchObservationSubmission.createMany({
        skipDuplicates: true,
        data: [
          {
            id: attemptId,
            ownerId: identity.logical.ownerId,
            submissionId: identity.submissionId,
            observationId: observation.id,
            requestDigest: identity.requestDigest,
            visibleAt: new Date(identity.visibleAt),
            state: 'pending',
            createdAt: now,
            expiresAt: new Date(now.getTime() + ATTEMPT_MS),
          },
        ],
      });
      const where = {
        ownerId_submissionId: {
          ownerId: identity.logical.ownerId,
          submissionId: identity.submissionId,
        },
      };
      let row = await tx.researchObservationSubmission.findUniqueOrThrow({
        where,
        include: { version: true },
      });
      if (row.requestDigest !== identity.requestDigest || row.observationId !== observation.id)
        throw new ConflictException('复核提交标识已绑定其他报告、断言或截止时点');
      await tx.researchObservationSubmission.updateMany({
        where: { id: row.id, state: 'pending', expiresAt: { lte: now } },
        data: { state: 'failed', errorCode: 'attempt_expired', completedAt: now },
      });
      row = await tx.researchObservationSubmission.findUniqueOrThrow({
        where,
        include: { version: true },
      });
      return {
        acquired: row.id === attemptId && row.state === 'pending',
        attempt: projectAttempt(row),
      };
    });
  }

  async finish(ownerId: string, submissionId: string, rawInputs: unknown, rawEvaluation: unknown) {
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lock(tx, ownerId, submissionId);
      if (row.state !== 'pending') return projectAttempt(row);
      const now = new Date();
      if (row.expiresAt <= now) return this.failLocked(tx, row, 'attempt_expired', now);
      const inputs = researchObservationInputsSchema.parse(rawInputs);
      inputs.visibleAt = new Date(inputs.visibleAt).toISOString();
      const evaluation = researchObservationEvaluationSchema.parse(rawEvaluation);
      const observation = await tx.researchObservation.findUniqueOrThrow({
        where: { id: row.observationId },
      });
      if (
        Date.parse(inputs.visibleAt) !== row.visibleAt.getTime() ||
        evaluation.window.tradingDays !== observation.windowTradingDays
      )
        throw new ConflictException('复核结果与提交截止时点或观察窗口不一致');
      const payload = { inputs, evaluation };
      const inputFingerprint = researchObservationDigest({
        logicalKey: observation.logicalKey,
        version: 'research-observation-input-v1',
        ...payload,
      });
      await tx.researchObservationVersion.createMany({
        skipDuplicates: true,
        data: [
          {
            id: randomUUID(),
            observationId: row.observationId,
            inputFingerprint,
            visibleAt: row.visibleAt,
            payload,
          },
        ],
      });
      const version = await tx.researchObservationVersion.findUniqueOrThrow({
        where: {
          observationId_inputFingerprint: { observationId: row.observationId, inputFingerprint },
        },
      });
      await tx.researchObservationSubmission.update({
        where: { id: row.id },
        data: { state: 'succeeded', versionId: version.id, completedAt: now },
      });
      return projectAttempt({ ...row, state: 'succeeded', errorCode: null, version });
    });
  }

  async fail(ownerId: string, submissionId: string) {
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lock(tx, ownerId, submissionId);
      if (row.state !== 'pending') return projectAttempt(row);
      const now = new Date();
      let code: 'attempt_expired' | 'data_read_failed' = 'data_read_failed';
      if (row.expiresAt <= now) code = 'attempt_expired';
      return this.failLocked(tx, row, code, now);
    });
  }

  /** 按截止时点选择投影，旧时点晚到只增加历史版本。 */
  async readRun(ownerId: string, runId: string, asOf: Date) {
    const rows = await this.prisma.researchObservation.findMany({
      where: { ownerId, runId },
      orderBy: { id: 'asc' },
      take: 100,
      include: {
        versions: {
          where: { visibleAt: { lte: asOf } },
          orderBy: [{ visibleAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
        },
      },
    });
    return rows.map(({ versions, ...observation }) => ({
      ...observation,
      current: versions[0] ? projectVersion(versions[0]) : null,
    }));
  }

  async history(ownerId: string, runId: string, observationId: string) {
    const row = await this.prisma.researchObservation.findFirst({
      where: { id: observationId, ownerId, runId },
      include: {
        versions: {
          orderBy: [{ visibleAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
          take: 101,
        },
      },
    });
    if (!row) throw new NotFoundException('研究观察不存在或不可访问');
    return {
      versions: row.versions.slice(0, 100).map(projectVersion),
      truncated: row.versions.length > 100,
    };
  }

  async sampleRunIds(ownerId: string, asOf: Date) {
    const rows = await this.prisma.researchObservation.groupBy({
      by: ['runId'],
      where: {
        ownerId,
        methodVersion: 'research-price-direction-v1',
        versions: { some: { visibleAt: { lte: asOf } } },
      },
      _max: { createdAt: true },
      orderBy: [{ _max: { createdAt: 'desc' } }, { runId: 'asc' }],
      take: 201,
    });
    return { runIds: rows.slice(0, 200).map((row) => row.runId), truncated: rows.length > 200 };
  }

  /** 统计只读取评估投影，避免批量载入完整价格与日历输入。 */
  async sampleProjections(ownerId: string, runIds: string[], asOf: Date) {
    if (!runIds.length) return { rows: [], truncated: false };
    const rows = await this.prisma.$queryRaw<
      Array<{
        observationId: string;
        runId: string;
        lineageId: string;
        claimId: string;
        artifactFingerprint: string;
        methodVersion: string;
        windowTradingDays: number | null;
        versionId: string;
        visibleAt: Date;
        recordedAt: Date;
        evaluation: Prisma.JsonValue;
      }>
    >(Prisma.sql`
      SELECT o."id" AS "observationId", o."runId", o."lineageId", o."claimId",
        o."artifactFingerprint", o."methodVersion", o."windowTradingDays",
        v."id" AS "versionId", v."visibleAt", v."createdAt" AS "recordedAt",
        v."payload" -> 'evaluation' AS "evaluation"
      FROM "ResearchObservation" o JOIN LATERAL (
        SELECT * FROM "ResearchObservationVersion" v
        WHERE v."observationId" = o."id" AND v."visibleAt" <= ${asOf}
        ORDER BY v."visibleAt" DESC, v."createdAt" DESC, v."id" DESC LIMIT 1
      ) v ON TRUE
      WHERE o."ownerId" = ${ownerId}::uuid AND o."methodVersion" = 'research-price-direction-v1'
        AND o."runId" IN (${Prisma.join(runIds.map((id) => Prisma.sql`${id}::uuid`))})
      ORDER BY o."createdAt" DESC, o."id" DESC LIMIT 201
    `);
    return { rows: rows.slice(0, 200), truncated: rows.length > 200 };
  }

  private async lock(tx: Prisma.TransactionClient, ownerId: string, submissionId: string) {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "ResearchObservationSubmission"
      WHERE "ownerId" = ${ownerId}::uuid AND "submissionId" = ${submissionId}::uuid FOR UPDATE
    `;
    if (!locked.length) throw new NotFoundException('复核提交不存在或不可访问');
    return tx.researchObservationSubmission.findUniqueOrThrow({
      where: { id: locked[0]!.id },
      include: { version: true },
    });
  }
  private async failLocked(
    tx: Prisma.TransactionClient,
    row: AttemptRow,
    errorCode: 'attempt_expired' | 'data_read_failed',
    now: Date,
  ) {
    await tx.researchObservationSubmission.update({
      where: { id: row.id },
      data: { state: 'failed', errorCode, completedAt: now },
    });
    return projectAttempt({ ...row, state: 'failed', errorCode, version: null });
  }
}

import type { PrismaService } from '../../platform/prisma.service.js';
import { StructuredLogger } from '../../platform/structured-logger.js';
import type { AiExecutionStateStore } from '../ai-execution-state.store.js';
import type { AiRunService } from '../ai-run.service.js';
import { AiExecutionTrace } from './ai-execution-trace.js';
import {
  aiTraceReferenceSchema,
  AiTraceUnavailableError,
  type AiTraceManifest,
} from './ai-trace-contract.js';
import { withAiTraceScope } from './ai-trace-context.js';
import { AiTraceFileStore } from './ai-trace-file-store.js';

type ClaimedRun = NonNullable<Awaited<ReturnType<AiRunService['claim']>>>;
const record = (value: unknown) =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

/** 只管理已领取、已绑定 owner/attempt 的一次业务执行；未选择 trace 时不触碰文件系统。 */
export class AiTraceCaptureService {
  private readonly logger = new StructuredLogger('ai-trace');
  constructor(
    private readonly prisma: PrismaService,
    private readonly executions: AiExecutionStateStore,
    private readonly files = new AiTraceFileStore(),
  ) {}

  async runClaimed(run: ClaimedRun, work: () => Promise<void>) {
    const raw = record(run.modelMetadata)?.diagnosticTrace;
    if (raw === undefined) return work();
    const reference = aiTraceReferenceSchema.safeParse(raw);
    const ownership = { runId: run.id, executionAttempt: run.executionAttempt };
    let trace: AiExecutionTrace;
    try {
      if (!reference.success || !run.researchOwnerId)
        throw new AiTraceUnavailableError('invalid_identity');
      const files = await this.files.open(reference.data, {
        ...ownership,
        ownerId: run.researchOwnerId,
      });
      const manifest: AiTraceManifest = {
        ...reference.data,
        ...ownership,
        ownerId: run.researchOwnerId,
        startedAt: new Date().toISOString(),
        completedAt: null,
        status: 'running',
        captureStatus: 'complete',
        nativeFetches: 0,
        nodes: [],
        artifacts: [],
        issues: [],
      };
      trace = new AiExecutionTrace(manifest, files);
    } catch {
      await this.executions.failOwned(ownership, {
        errorCode: 'research_trace_unavailable',
        errorSummary: '请求 trace 存储不可用，未派发模型请求',
      });
      this.publish({
        operation: 'ai.trace',
        runId: run.id,
        executionAttempt: run.executionAttempt,
        status: 'unavailable',
        captureStatus: 'incomplete',
        nativeFetches: 0,
      });
      return;
    }
    await withAiTraceScope({ trace }, async () => {
      let canonicalStatus: AiTraceManifest['status'] = 'incomplete';
      let observed = false;
      const observeFinal = async () => {
        observed = true;
        try {
          const final = await trace.runNode(
            'business.final_state',
            { ...ownership, ownerId: run.researchOwnerId },
            () =>
              this.prisma.aiRun.findFirst({
                where: {
                  id: run.id,
                  researchOwnerId: run.researchOwnerId,
                  executionAttempt: run.executionAttempt,
                },
                select: {
                  id: true,
                  researchOwnerId: true,
                  executionAttempt: true,
                  status: true,
                  result: true,
                  errorCode: true,
                  errorSummary: true,
                  completedAt: true,
                },
              }),
          );
          if (final && ['succeeded', 'failed', 'cancelled'].includes(final.status))
            canonicalStatus = final.status as AiTraceManifest['status'];
          else trace.issue('terminal_state_not_observed');
          return final;
        } catch {
          trace.issue('terminal_state_read_failed');
          return null;
        }
      };
      try {
        await trace.runNode(
          'business.execution',
          {
            runId: run.id,
            ownerId: run.researchOwnerId,
            executionAttempt: run.executionAttempt,
            question: run.question,
            context: run.context,
            promptVersion: run.promptVersion,
            provider: run.provider,
            model: run.model,
            metadata: run.modelMetadata,
          },
          async () => {
            let final: Awaited<ReturnType<typeof observeFinal>>;
            try {
              await work();
            } finally {
              final = await observeFinal();
            }
            return final;
          },
        );
      } catch (error) {
        if (!(error instanceof AiTraceUnavailableError)) throw error;
        await this.executions.failOwned(ownership, {
          errorCode: 'research_trace_unavailable',
          errorSummary: '请求 trace 存储不可用，未派发模型请求',
        });
      } finally {
        if (!observed) await observeFinal();
        await trace.finish(canonicalStatus);
        this.publish({
          operation: 'ai.trace',
          traceId: trace.manifest.traceId,
          runId: run.id,
          executionAttempt: run.executionAttempt,
          status: canonicalStatus,
          captureStatus: trace.manifest.captureStatus,
          nativeFetches: trace.manifest.nativeFetches,
        });
      }
    });
  }

  private publish(record: Parameters<StructuredLogger['log']>[0]) {
    try {
      this.logger.log(record);
    } catch {
      /* 日志后端不可用不得改写业务终态。 */
    }
  }
}

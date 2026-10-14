import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import {
  AUTHORING_LIMITS,
  AUTHORING_CAPABILITY_VERSION,
  authoringModificationTargetSchema,
} from '@thesis-ledger/schemas';
import { requireAuthoringModification } from './authoring-modification.js';
import { AiProviderService } from '../ai/ai-provider.service.js';
import { AiProviderRegistry } from '../ai/provider-registry.js';
import { AuthoringDraftRepository } from './authoring-draft.repository.js';
import { AuthoringOperationRepository } from './authoring-operation.repository.js';
import { AuthoringQueue } from './authoring-queue.js';
import {
  authoringContract,
  authoringCost,
  authoringPricingFingerprint,
} from './authoring-model-policy.js';
import { requireAuthoringGeneration } from './authoring-semantics.js';
import { InstrumentService } from '../market/instrument.service.js';
import { isEqual } from 'es-toolkit';
import { AUTHORING_PROMPT_VERSION } from './authoring-prompt.js';

export const authoringSubmitSchema = z
  .object({
    kind: z.enum(['analyze', 'generate', 'modify']),
    expectedRevision: z.number().int().positive(),
    idempotencyKey: z.string().trim().min(1).max(120),
    providerId: z.string().trim().min(1).max(120),
    model: z.string().trim().min(1).max(240),
    intent: z.string().max(AUTHORING_LIMITS.descriptionCharacters),
    unknownCostAcknowledgedAt: z.iso.datetime().nullable(),
    modificationTarget: authoringModificationTargetSchema.optional(),
  })
  .strict();

@Injectable()
export class AuthoringSubmitService {
  constructor(
    private readonly drafts: AuthoringDraftRepository,
    private readonly operations: AuthoringOperationRepository,
    private readonly queue: AuthoringQueue,
    private readonly providers: AiProviderService,
    private readonly registry: AiProviderRegistry,
    private readonly instruments: InstrumentService,
  ) {}
  async submit(ownerId: string, draftId: string, raw: unknown) {
    const request = authoringSubmitSchema.parse(raw);
    const previous = await this.operations.findIntent(ownerId, draftId, request.idempotencyKey);
    if (previous) {
      const selection = previous.input.selection;
      if (
        Object.entries(request).some(
          ([key, value]) => selection[key as keyof typeof request] !== value,
        )
      )
        throw new ConflictException({
          code: 'AUTHORING_IDEMPOTENCY_CONFLICT',
          message: '同一意图不能更换输入',
        });
      return previous;
    }
    const draft = await this.drafts.read(ownerId, draftId);
    if (request.kind === 'modify') requireAuthoringModification(draft.content, request);
    else if (request.modificationTarget)
      throw new BadRequestException('只有局部修改可以选择修改范围');
    if (request.kind !== 'analyze') {
      const confirmation = requireAuthoringGeneration(draft.content);
      const instrument = await this.instruments.resolveTradableInstrument(
        confirmation.instrumentId,
      );
      if (!isEqual(instrument, confirmation.instrument))
        throw new BadRequestException({
          code: 'AUTHORING_INSTRUMENT_MISMATCH',
          message: '目录标识已变化，请重新选择标的',
        });
    }
    try {
      await this.queue.ready();
      await this.providers.refreshRegistry();
    } catch {
      throw new ServiceUnavailableException({
        code: 'AUTHORING_UNAVAILABLE',
        message: '编写执行服务暂不可用，草稿已保留',
      });
    }
    const contract = authoringContract(request.kind);
    let route: ReturnType<AiProviderRegistry['strictReadyContract']>;
    try {
      route = this.registry.strictReadyContract({
        providerId: request.providerId,
        model: request.model,
        contract: contract.ref,
        budgetAuthorized: true,
      });
    } catch {
      throw new BadRequestException({
        code: 'AUTHORING_MODEL_UNAVAILABLE',
        message: '所选模型尚无可用编写用途，请在 AI 配置中验证',
      });
    }
    if (route.execution.liveValidation.status !== 'passed')
      throw new BadRequestException({
        code: 'AUTHORING_MODEL_UNVERIFIED',
        message: '所选模型的当前编写用途尚未通过实际验证',
      });
    const estimate = authoringCost(route.provider, request.model, {
      status: 'reported',
      inputTokens: Math.ceil(Buffer.byteLength(JSON.stringify(draft.content), 'utf8')) + 4096,
      outputTokens: AUTHORING_LIMITS.outputTokens,
    });
    if (
      estimate.status === 'unknown' &&
      (!request.unknownCostAcknowledgedAt ||
        Math.abs(Date.now() - Date.parse(request.unknownCostAcknowledgedAt)) > 600_000)
    )
      throw new BadRequestException({
        code: 'AUTHORING_COST_ACK_REQUIRED',
        message: '费用未知，请针对所选模型重新明确确认',
      });
    const operation = await this.operations.submit(ownerId, draftId, {
      ...request,
      cost: estimate,
      capabilityVersion: AUTHORING_CAPABILITY_VERSION,
      promptVersion: AUTHORING_PROMPT_VERSION,
      configurationFingerprint: route.execution.readiness.configurationFingerprint,
      pricingFingerprint: authoringPricingFingerprint(route.provider, request.model),
    });
    try {
      await this.queue.enqueue(operation.id);
    } catch {
      throw new ServiceUnavailableException({
        code: 'AUTHORING_DELIVERY_PENDING',
        message: '操作已保存但投递未确认，请用同一意图读取状态',
        operationId: operation.id,
      });
    }
    return operation;
  }
}

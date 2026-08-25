import { Body, Controller, Get, Optional, Param, Patch, Post, Query } from '@nestjs/common';
import {
  aiCheckpointInputSchema,
  aiDecisionLogInputSchema,
  aiResearchStartInputSchema,
  aiRunCursorSchema,
  aiRunStatusSchema,
  aiRunStartInputSchema,
  omitUndefinedDeep,
} from '@thesis-ledger/schemas';
import { z } from 'zod';
import { AiRunService } from './ai-run.service.js';
import { AiResearchExecutor } from './ai-research.executor.js';

const clientAuditMetadataFields = new Set([
  'inputTokens',
  'outputTokens',
  'cost',
  'durationMs',
  'usage',
  'toolCall',
  'toolCalls',
  'fallbackErrors',
]);

const clientModelMetadataSchema = z.unknown().superRefine((value, context) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const field of clientAuditMetadataFields) {
    if (!Object.hasOwn(value, field)) continue;
    context.addIssue({
      code: 'custom',
      path: [field],
      message: `modelMetadata.${field} 属于服务端审计字段，客户端不得写入`,
    });
  }
});

const parseHistoryLimit = (value?: string) => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

@Controller('ai/runs')
export class AiController {
  constructor(
    private readonly runs: AiRunService,
    @Optional() private readonly executor?: AiResearchExecutor,
  ) {}

  @Get()
  history(
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
  ) {
    const parsedStatus = status === undefined ? undefined : aiRunStatusSchema.parse(status);
    const parsedCursor = cursor === undefined ? undefined : aiRunCursorSchema.parse(cursor);
    const listPage = (
      this.runs as unknown as {
        listPage?: (pageLimit?: number, pageStatus?: string, pageCursor?: string) => unknown;
      }
    ).listPage;
    if (listPage)
      return listPage.call(this.runs, parseHistoryLimit(limit), parsedStatus, parsedCursor);
    return this.runs.list(parseHistoryLimit(limit), parsedStatus);
  }

  @Post()
  start(@Body() input: unknown) {
    if (
      input &&
      typeof input === 'object' &&
      !Array.isArray(input) &&
      'question' in input &&
      !('provider' in input)
    ) {
      const created = this.runs.startResearch(aiResearchStartInputSchema.parse(input));
      if (this.executor)
        void Promise.resolve(created).then((run) => this.executor?.dispatch(run.id));
      return created;
    }
    const body = aiRunStartInputSchema.parse(input);
    const modelMetadata =
      body.modelMetadata === undefined
        ? undefined
        : clientModelMetadataSchema.parse(body.modelMetadata);
    if (body.question !== undefined || body.retryOfRunId !== undefined) {
      return this.runs.start(
        body.provider,
        body.model,
        body.promptVersion,
        body.context,
        modelMetadata,
        body.question,
        body.retryOfRunId,
      );
    }
    return this.runs.start(
      body.provider,
      body.model,
      body.promptVersion,
      body.context,
      modelMetadata,
    );
  }

  @Patch(':id/checkpoint')
  checkpoint(@Param('id') id: string, @Body() input: unknown) {
    return this.runs.checkpoint(id, aiCheckpointInputSchema.parse(input));
  }

  @Get('usage/summary')
  usage(@Query('start') start?: string, @Query('end') end?: string) {
    return this.runs.usageSummary(
      start ? new Date(start) : undefined,
      end ? new Date(end) : undefined,
    );
  }

  @Post('decision-logs')
  decisionLog(@Body() input: unknown) {
    return this.runs.createDecisionLog(omitUndefinedDeep(aiDecisionLogInputSchema.parse(input)));
  }

  @Get('decision-logs')
  decisionLogs(@Query('symbol') symbol?: string) {
    return this.runs.listDecisionLogs(symbol);
  }

  @Get('capabilities')
  capabilities() {
    return (
      this.executor?.capabilities() ?? {
        canStart: false,
        providers: [],
        checkedAt: new Date().toISOString(),
      }
    );
  }

  @Get(':id/tool-calls')
  toolCalls(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const parsedCursor = cursor === undefined ? undefined : aiRunCursorSchema.parse(cursor);
    return this.runs.listToolCalls(id, parseHistoryLimit(limit), parsedCursor);
  }

  @Get(':id')
  resume(@Param('id') id: string) {
    return this.runs.resume(id);
  }
}

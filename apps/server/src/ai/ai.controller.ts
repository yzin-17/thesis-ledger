import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  aiCheckpointInputSchema,
  aiDecisionLogInputSchema,
  aiRunStartInputSchema,
  omitUndefinedDeep,
} from '@thesis-ledger/schemas';
import { z } from 'zod';
import { AiRunService } from './ai-run.service.js';

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

@Controller('ai/runs')
export class AiController {
  constructor(private readonly runs: AiRunService) {}

  @Get()
  history(@Query('limit') limit?: string) {
    return this.runs.list(limit === undefined ? undefined : Number(limit));
  }

  @Post()
  start(@Body() input: unknown) {
    const body = aiRunStartInputSchema.parse(input);
    const modelMetadata =
      body.modelMetadata === undefined
        ? undefined
        : clientModelMetadataSchema.parse(body.modelMetadata);
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

  @Get(':id')
  resume(@Param('id') id: string) {
    return this.runs.resume(id);
  }
}

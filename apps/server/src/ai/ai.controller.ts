import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  aiCheckpointInputSchema,
  aiDecisionLogInputSchema,
  aiRunFinishInputSchema,
  aiRunStartInputSchema,
  omitUndefinedDeep,
} from '@thesis-ledger/schemas';
import { z } from 'zod';
import { AiRunService } from './ai.service.js';

const aiToolCallHttpSchema = z.object({
  tool: z.string().trim().min(1),
  permission: z.enum([
    'market:read',
    'portfolio:read',
    'risk:read',
    'journal:read',
    'financials:read',
    'news:read',
    'announcements:read',
    'backtest:run',
  ]),
  status: z.enum(['ok', 'unavailable', 'denied']),
  inputSummary: z.string(),
  outputSummary: z.string().optional(),
  provider: z.string().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  marketTime: z.iso.datetime({ offset: true }).optional(),
  availableAt: z.iso.datetime({ offset: true }).optional(),
  fetchedAt: z.iso.datetime({ offset: true }).optional(),
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
    return this.runs.start(
      body.provider,
      body.model,
      body.promptVersion,
      body.context,
      body.modelMetadata,
    );
  }

  @Patch(':id/checkpoint')
  checkpoint(@Param('id') id: string, @Body() input: unknown) {
    return this.runs.checkpoint(id, aiCheckpointInputSchema.parse(input));
  }

  @Post(':id/finish')
  finish(@Param('id') id: string, @Body() input: unknown) {
    const body = aiRunFinishInputSchema.parse(input);
    return this.runs.finish(id, body.result, body.usage);
  }

  @Get(':id')
  resume(@Param('id') id: string) {
    return this.runs.resume(id);
  }

  @Post(':id/tool-calls')
  toolCall(@Param('id') id: string, @Body() input: unknown) {
    const body = omitUndefinedDeep(aiToolCallHttpSchema.parse(input));
    return this.runs.recordToolCall({ runId: id, ...body });
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
}

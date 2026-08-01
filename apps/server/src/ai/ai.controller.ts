import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AiRunService } from './ai.service.js';

@Controller('ai/runs')
export class AiController {
  constructor(private readonly runs: AiRunService) {}

  @Get()
  history(@Query('limit') limit?: string) {
    return this.runs.list(limit === undefined ? undefined : Number(limit));
  }

  @Post()
  start(
    @Body()
    body: {
      provider: string;
      model: string;
      promptVersion: string;
      context?: unknown;
      modelMetadata?: unknown;
    },
  ) {
    return this.runs.start(
      body.provider,
      body.model,
      body.promptVersion,
      body.context,
      body.modelMetadata,
    );
  }

  @Patch(':id/checkpoint')
  checkpoint(@Param('id') id: string, @Body() checkpoint: object) {
    return this.runs.checkpoint(id, checkpoint);
  }

  @Post(':id/finish')
  finish(
    @Param('id') id: string,
    @Body()
    body: {
      result: unknown;
      usage: { inputTokens: number; outputTokens: number; cost: number };
    },
  ) {
    return this.runs.finish(id, body.result, body.usage);
  }

  @Get(':id')
  resume(@Param('id') id: string) {
    return this.runs.resume(id);
  }

  @Post(':id/tool-calls')
  toolCall(
    @Param('id') id: string,
    @Body()
    body: {
      tool: string;
      permission: Parameters<AiRunService['recordToolCall']>[0]['permission'];
      status: 'ok' | 'unavailable' | 'denied';
      inputSummary: string;
      outputSummary?: string;
      provider?: string;
      durationMs?: number;
      marketTime?: string;
      availableAt?: string;
      fetchedAt?: string;
    },
  ) {
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
  decisionLog(
    @Body()
    body: {
      symbol?: string;
      accountId?: string;
      question: string;
      assumptions: unknown;
      conclusion: unknown;
      context?: unknown;
      provenance?: unknown;
    },
  ) {
    return this.runs.createDecisionLog(body);
  }

  @Get('decision-logs')
  decisionLogs(@Query('symbol') symbol?: string) {
    return this.runs.listDecisionLogs(symbol);
  }
}

import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Header,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';
import { marketReferenceInputSchema, marketReferenceRequestSchema } from '@thesis-ledger/schemas';
import { DsaClient, DsaError } from '../integration/dsa/dsa.client.js';
import { readMarketReference } from '../integration/dsa/dsa-market-reference.js';

@Controller('api/market-data')
export class MarketReferenceController {
  constructor(@Inject(DsaClient) private readonly dsa: DsaClient) {}

  @Post('reference')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async read(
    @Body() input: unknown,
    @Query() query: Record<string, unknown>,
    @Req() http: Request,
  ) {
    if (Object.keys(query).length) throw new BadRequestException('资料入口不接受额外查询参数');
    const checked = marketReferenceInputSchema.safeParse(input);
    if (!checked.success) throw new BadRequestException('请选择有效资料类型、代码、日期与分页');
    const request = marketReferenceRequestSchema.parse({
      ...checked.data,
      requestId: randomUUID(),
      contractVersion: 3,
      consumer: 'thesis-ledger',
    });
    const abort = new AbortController();
    const cancel = () => abort.abort();
    http.once('aborted', cancel);
    try {
      return await readMarketReference(this.dsa, request, abort.signal);
    } catch (error) {
      if (error instanceof DsaError)
        throw new ServiceUnavailableException({
          message: '资料来源暂不可读，请核对路由、权限、来源限制或稍后重试。',
          code: error.sourceReason ?? error.code,
          requestId: request.requestId,
        });
      throw error;
    } finally {
      http.off('aborted', cancel);
    }
  }
}

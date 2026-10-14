import {
  BadGatewayException,
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
} from '@nestjs/common';
import { marketAnnouncementsSchema } from '@thesis-ledger/schemas';
import { DsaClient } from '../integration/dsa/dsa.client.js';

@Controller('api/market-data/announcements')
export class MarketAnnouncementsController {
  constructor(@Inject(DsaClient) private readonly dsa: DsaClient) {}

  @Get()
  async list(@Query('q') q = '', @Query('page') page = '1', @Query('pageSize') pageSize = '50') {
    if (
      q.length > 200 ||
      !/^\d+$/.test(page) ||
      !/^\d+$/.test(pageSize) ||
      Number(page) < 1 ||
      Number(pageSize) < 1 ||
      Number(pageSize) > 100
    ) {
      throw new BadRequestException('公告查询参数无效');
    }
    const params = new URLSearchParams({ q, page, pageSize });
    const raw = await this.dsa.get<unknown>(`/api/v3/thesis-ledger/market/announcements?${params}`);
    const result = marketAnnouncementsSchema.safeParse(raw);
    if (!result.success) throw new BadGatewayException('公告目录响应无效');
    return result.data;
  }
}

import { BadRequestException, Controller, Get, Header, Inject, Query } from '@nestjs/common';
import { securityLotSymbolSchema } from '@thesis-ledger/schemas';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { readSecurityLotSize } from '../integration/dsa/dsa-security-lot-size.js';

@Controller('api/market-data')
export class MarketSecurityLotSizeController {
  constructor(@Inject(DsaClient) private readonly dsa: DsaClient) {}

  @Get('security-lot-size')
  @Header('Cache-Control', 'no-store')
  read(@Query('symbol') symbol?: string) {
    const parsed = securityLotSymbolSchema.safeParse(symbol);
    if (!parsed.success) throw new BadRequestException('请提供港股股票代码，例如 00700.HK');
    return readSecurityLotSize(this.dsa, parsed.data);
  }
}

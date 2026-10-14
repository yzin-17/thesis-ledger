import { BadRequestException, Controller, Get, Header, Inject, Query } from '@nestjs/common';
import { securityStaticSymbolSchema, securityStaticAssetTypeSchema } from '@thesis-ledger/schemas';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { readSecurityStaticInfo } from '../integration/dsa/dsa-security-static-info.js';

@Controller('api/market-data')
export class MarketSecurityStaticInfoController {
  constructor(@Inject(DsaClient) private readonly dsa: DsaClient) {}

  @Get('security-static-info')
  @Header('Cache-Control', 'no-store')
  read(@Query('symbol') symbol?: string, @Query('assetType') assetType?: string,
    @Query() query?: Record<string, unknown>) {
    if (query && Object.keys(query).some(key => key !== 'symbol' && key !== 'assetType'))
      throw new BadRequestException('当前证券资料不接受历史或额外查询参数');
    const parsedSymbol = securityStaticSymbolSchema.safeParse(symbol);
    const parsedType = securityStaticAssetTypeSchema.safeParse(assetType);
    if (!parsedSymbol.success || !parsedType.success)
      throw new BadRequestException('请提供港美证券代码及股票或 ETF 类型');
    return readSecurityStaticInfo(this.dsa, parsedSymbol.data, parsedType.data);
  }
}

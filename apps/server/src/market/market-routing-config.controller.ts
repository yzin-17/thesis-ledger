import { Body, Controller, Get, Header, Post, Put } from '@nestjs/common';
import { MarketRoutingConfigService } from './market-routing-config.service.js';

@Controller('api/market-data/routing-config')
export class MarketRoutingConfigController {
  constructor(private readonly routing: MarketRoutingConfigService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  read() {
    return this.routing.read();
  }
  @Post('preview')
  preview(@Body() input: unknown) {
    return this.routing.preview(input);
  }
  @Put()
  save(@Body() input: unknown) {
    return this.routing.save(input);
  }
}

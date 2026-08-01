import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ProviderConfigService, type ProviderConfigInput } from './provider-config.service.js';

@Controller('providers/config')
export class ProviderConfigController {
  constructor(private readonly providers: ProviderConfigService) {}

  @Get()
  list() {
    return this.providers.list();
  }

  @Post()
  save(@Body() body: ProviderConfigInput) {
    return this.providers.save(body);
  }

  @Post(':name/test')
  test(@Param('name') name: string) {
    return this.providers.test(name);
  }

  @Get(':name/usage')
  usage(@Param('name') name: string) {
    return this.providers.usage(name);
  }
}

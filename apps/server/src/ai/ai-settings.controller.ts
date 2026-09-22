import { Body, Controller, Get, Patch } from '@nestjs/common';
import { aiRoutingSettingsUpdateSchema } from './ai-routing-settings.contracts.js';
import { AiProviderService } from './ai-provider.service.js';

@Controller('ai/settings')
export class AiSettingsController {
  constructor(private readonly providers: AiProviderService) {}

  @Get()
  get() {
    return this.providers.getRoutingSettings();
  }

  @Patch()
  update(@Body() input: unknown) {
    return this.providers.updateRoutingSettings(aiRoutingSettingsUpdateSchema.parse(input));
  }
}

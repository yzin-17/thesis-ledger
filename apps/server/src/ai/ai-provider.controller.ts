import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { AiProviderService } from './ai-provider.service.js';
import {
  aiProviderInputSchema,
  aiProviderModelCatalogInputSchema,
} from './ai-provider.contracts.js';

const enabledSchema = z.object({ enabled: z.boolean() }).strict();

@Controller('ai/providers')
export class AiProviderController {
  constructor(private readonly providers: AiProviderService) {}

  @Get()
  list() {
    return this.providers.list();
  }

  @Post()
  save(@Body() input: unknown) {
    return this.providers.save(aiProviderInputSchema.parse(input));
  }

  @Post('test')
  testDraft(@Body() input: unknown) {
    return this.providers.testDraft(aiProviderInputSchema.parse(input));
  }

  @Post('models')
  models(@Body() input: unknown) {
    return this.providers.models(aiProviderModelCatalogInputSchema.parse(input));
  }

  @Post(':name/test')
  testSaved(@Param('name') name: string) {
    return this.providers.testSaved(name);
  }

  @Patch(':name/enabled')
  setEnabled(@Param('name') name: string, @Body() input: unknown) {
    const parsed = enabledSchema.parse(input);
    return this.providers.setEnabled(name, parsed.enabled);
  }

  @Delete(':name')
  remove(@Param('name') name: string) {
    return this.providers.remove(name);
  }
}

import { Module } from '@nestjs/common';
import { AiController } from './ai.controller.js';
import { AiRunService } from './ai-run.service.js';
import { AiResearchExecutor } from './ai-research.executor.js';
import { AiProviderRegistry } from './provider-registry.js';
import { PromptVersionRegistry } from './prompt-registry.js';
import { createConfiguredAiProviders } from './provider-adapters.js';
import { loadConfig } from '../platform/config.js';

@Module({
  controllers: [AiController],
  providers: [
    AiRunService,
    {
      provide: AiProviderRegistry,
      useFactory: () => {
        const registry = new AiProviderRegistry();
        for (const provider of createConfiguredAiProviders(loadConfig()))
          registry.register(provider);
        return registry;
      },
    },
    {
      provide: PromptVersionRegistry,
      useFactory: () => {
        const registry = new PromptVersionRegistry();
        registry.register({
          name: 'research',
          version: 'research-v1',
          template:
            '你是研究助手。只基于已提供的服务端证据作答，输出 ResearchResult V1 JSON；不得生成订单或执行指令。',
          changedAt: new Date().toISOString(),
        });
        return registry;
      },
    },
    AiResearchExecutor,
  ],
  exports: [AiRunService, AiProviderRegistry, PromptVersionRegistry, AiResearchExecutor],
})
export class AiModule {}

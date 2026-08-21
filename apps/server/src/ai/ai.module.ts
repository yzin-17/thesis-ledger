import { Module } from '@nestjs/common';
import { AiController } from './ai.controller.js';
import { AiRunService } from './ai-run.service.js';

@Module({
  controllers: [AiController],
  providers: [AiRunService],
  exports: [AiRunService],
})
export class AiModule {}

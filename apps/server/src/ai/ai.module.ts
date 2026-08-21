import { Module } from '@nestjs/common';
import { AiController } from './ai.controller.js';
import { AiRunService } from './ai.service.js';

@Module({
  controllers: [AiController],
  providers: [AiRunService],
  exports: [AiRunService],
})
export class AiModule {}

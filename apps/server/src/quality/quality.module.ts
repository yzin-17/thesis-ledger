import { Module } from '@nestjs/common';
import { IntegrityController } from '../integrity/integrity.controller.js';
import { IntegrityService } from '../integrity/integrity.service.js';
import { DataQualityController } from './data-quality.controller.js';
import { DataQualityService } from './data-quality.service.js';

@Module({
  controllers: [DataQualityController, IntegrityController],
  providers: [DataQualityService, IntegrityService],
  exports: [DataQualityService, IntegrityService],
})
export class QualityModule {}

import { Controller, Get } from '@nestjs/common';
import { IntegrityService } from './integrity.service.js';

@Controller('integrity')
export class IntegrityController {
  constructor(private readonly integrity: IntegrityService) {}

  @Get()
  check() {
    return this.integrity.check();
  }
}

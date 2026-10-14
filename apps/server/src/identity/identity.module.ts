import { Module } from '@nestjs/common';
import { IdentityService } from './identity.service.js';
import { IdentityGuard } from './identity.guard.js';
import { IdentityController } from './identity.controller.js';

@Module({ controllers: [IdentityController], providers: [IdentityService, IdentityGuard], exports: [IdentityService, IdentityGuard] })
export class IdentityModule {}

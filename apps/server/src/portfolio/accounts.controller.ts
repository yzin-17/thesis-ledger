import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AccountsService } from './accounts.service.js';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}
  @Get() list(@Query('includeInactive') includeInactive?: string) {
    return this.accounts.list(includeInactive === 'true');
  }
  @Post() create(@Body() body: unknown) {
    return this.accounts.create(body);
  }
  @Patch(':id') update(@Param('id') id: string, @Body() body: unknown) {
    return this.accounts.update(id, body);
  }
  @Delete(':id') deactivate(@Param('id') id: string) {
    return this.accounts.deactivate(id);
  }
  @Post(':id/reactivate') reactivate(@Param('id') id: string) {
    return this.accounts.reactivate(id);
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { accountModeSchema } from '@thesis-ledger/schemas';
import { AccountsService } from './accounts.service.js';
import { AccountPermanentDeletionService } from './account-permanent-deletion.service.js';

@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly permanentDeletion: AccountPermanentDeletionService,
  ) {}
  @Get() list(@Query('includeInactive') includeInactive?: string, @Query('mode') mode?: string) {
    let parsedMode: 'actual' | 'shadow' | undefined;
    if (mode !== undefined) {
      const parsed = accountModeSchema.safeParse(mode);
      if (!parsed.success) throw new BadRequestException('账户模式无效');
      parsedMode = parsed.data;
    }
    return this.accounts.list(includeInactive === 'true', parsedMode);
  }
  @Post() create(@Body() body: unknown) {
    return this.accounts.create(body);
  }
  @Patch(':id') update(@Param('id') id: string, @Body() body: unknown) {
    return this.accounts.update(id, body);
  }
  @Delete(':id/permanent')
  @HttpCode(HttpStatus.NO_CONTENT)
  async permanentDelete(@Param('id') id: string): Promise<void> {
    await this.permanentDeletion.delete(id);
  }
  @Delete(':id') deactivate(@Param('id') id: string) {
    return this.accounts.deactivate(id);
  }
  @Post(':id/reactivate') reactivate(@Param('id') id: string) {
    return this.accounts.reactivate(id);
  }
}

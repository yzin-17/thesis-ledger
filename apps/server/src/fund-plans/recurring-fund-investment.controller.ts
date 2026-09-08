import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RecurringFundInvestmentService } from './recurring-fund-investment.service.js';

@Controller('fund-investment-plans')
export class RecurringFundInvestmentPlanController {
  constructor(private readonly plans: RecurringFundInvestmentService) {}

  @Get()
  list(@Query('accountId') accountId?: string, @Query('status') status?: string) {
    return this.plans.list({
      ...(accountId === undefined ? {} : { accountId }),
      ...(status === undefined ? {} : { status }),
    });
  }

  @Post()
  create(@Body() input: unknown) {
    return this.plans.create(input);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() input: unknown) {
    return this.plans.update(id, input);
  }

  @Post(':id/pause')
  pause(@Param('id') id: string, @Body() input: unknown) {
    return this.plans.pause(id, input);
  }

  @Post(':id/resume')
  resume(@Param('id') id: string, @Body() input: unknown) {
    return this.plans.resume(id, input);
  }

  @Post(':id/end')
  end(@Param('id') id: string, @Body() input: unknown) {
    return this.plans.end(id, input);
  }
}

@Controller('fund-investment-occurrences')
export class RecurringFundInvestmentOccurrenceController {
  constructor(private readonly plans: RecurringFundInvestmentService) {}

  @Get()
  list(
    @Query('accountId') accountId?: string,
    @Query('planId') planId?: string,
    @Query('status') status?: string,
  ) {
    return this.plans.listOccurrences({
      ...(accountId === undefined ? {} : { accountId }),
      ...(planId === undefined ? {} : { planId }),
      ...(status === undefined ? {} : { status }),
    });
  }

  @Post(':id/confirm')
  confirm(@Param('id') id: string, @Body() input: unknown) {
    return this.plans.confirmOccurrence(id, input);
  }

  @Post(':id/skip')
  skip(@Param('id') id: string, @Body() input: unknown) {
    return this.plans.skipOccurrence(id, input);
  }

  @Post(':id/reopen')
  reopen(@Param('id') id: string, @Body() input: unknown) {
    return this.plans.reopenOccurrence(id, input);
  }
}

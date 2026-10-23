import {
  Body,
  Get,
  Controller,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { IdentityPrincipal } from '@thesis-ledger/schemas';
import { CurrentIdentity, IdentityGuard } from '../identity/identity.guard.js';
import { ResearchSubmissionService } from './research-submission.service.js';

@Controller('research')
@UseGuards(IdentityGuard)
export class ResearchController {
  constructor(
    @Inject(ResearchSubmissionService) private readonly submissions: ResearchSubmissionService,
  ) {}
  @Get('capabilities')
  @Header('Cache-Control', 'no-store')
  capabilities(@CurrentIdentity() principal: IdentityPrincipal, @Req() request: Request) {
    this.assertNoQuery(request);
    return this.submissions.capabilities(principal.id);
  }

  @Post('submissions')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async submit(
    @Body() input: unknown,
    @CurrentIdentity() principal: IdentityPrincipal,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.assertNoQuery(request);
    const controller = new AbortController();
    const aborted = () => controller.abort('client_disconnected');
    const closed = () => {
      if (!response.writableEnded) aborted();
    };
    request.once('aborted', aborted);
    response.once('close', closed);
    if (request.aborted || response.destroyed) aborted();
    try {
      return await this.submissions.submit(principal.id, input, controller.signal);
    } finally {
      request.off('aborted', aborted);
      response.off('close', closed);
    }
  }
  @Post('submissions/find')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  find(
    @Body() input: unknown,
    @CurrentIdentity() principal: IdentityPrincipal,
    @Req() request: Request,
  ) {
    this.assertNoQuery(request);
    return this.submissions.find(principal.id, input);
  }
  @Post('submissions/cancel')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  cancel(
    @Body() input: unknown,
    @CurrentIdentity() principal: IdentityPrincipal,
    @Req() request: Request,
  ) {
    this.assertNoQuery(request);
    return this.submissions.cancel(principal.id, input);
  }
  private assertNoQuery(request: Request) {
    if (Object.keys(request.query).length)
      throw new BadRequestException('研究提交参数只允许出现在请求正文');
  }
}

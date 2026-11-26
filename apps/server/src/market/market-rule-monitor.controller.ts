import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpException,
  Param,
  Post,
  Put,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ruleMonitorStatusSchema,
  ruleMonitorConfigResponseSchema,
  ruleMonitorConfigureSchema,
  ruleMonitorJobResponseSchema,
  ruleMonitorCheckSchema,
  ruleMonitorVersionsSchema,
  ruleMonitorJobIdSchema,
  ruleMonitorTaskSchema,
  ruleMonitorScheduleSchema,
  ruleMonitorVersionRequestSchema,
  ruleMonitorVersionDetailSchema,
} from '@thesis-ledger/schemas';
import { DsaClient, DsaError } from '../integration/dsa/dsa.client.js';

const root = '/api/v1/thesis-ledger/control/rule-monitor';
type Contract<T> = { safeParse(input: unknown): { success: true; data: T } | { success: false } };

@Controller('api/market-data/rule-monitor')
export class MarketRuleMonitorController {
  constructor(private readonly dsa: DsaClient) {}

  private async forward<T>(path: string, schema: Contract<T>, init?: RequestInit) {
    let raw: unknown;
    try {
      raw = await this.dsa.control<unknown>(root + path, init, 1);
    } catch (error) {
      if (error instanceof DsaError && error.status === 409)
        throw new HttpException(
          { code: 'rule_monitor_conflict', message: '监测配置或任务已变化，请重新读取。' },
          409,
        );
      if (error instanceof DsaError && error.status === 404)
        throw new HttpException(
          path.startsWith('/version?')
            ? { code: 'rule_monitor_version_not_found', message: '未找到资料版本。' }
            : { code: 'rule_monitor_job_not_found', message: '未找到监测任务。' },
          404,
        );
      if (error instanceof DsaError && error.status === 422)
        throw new HttpException(
          {
            code: 'rule_monitor_input_invalid',
            message:
              path === '/schedule'
                ? '执行时间或时区无效，请检查后重试。'
                : '监测来源已变化，请重新选择。',
          },
          422,
        );
      throw new ServiceUnavailableException('收费资料监测暂时不可用');
    }
    const result = schema.safeParse(raw);
    if (!result.success) throw new BadGatewayException('收费资料监测响应不符合合同');
    return result.data;
  }

  @Get() @Header('Cache-Control', 'no-store') status() {
    return this.forward('', ruleMonitorStatusSchema);
  }
  @Put('config') async configure(@Body() body: unknown) {
    const input = ruleMonitorConfigureSchema.safeParse(body);
    if (!input.success) throw new BadRequestException('请提供有效的监测来源和配置修订');
    const result = await this.forward('/config', ruleMonitorConfigResponseSchema, {
      method: 'PUT',
      body: JSON.stringify(input.data),
    });
    if (
      result.config.revision !== input.data.expectedRevision + 1 ||
      result.config.enabled !== input.data.enabled ||
      JSON.stringify(result.config.sourceIds) !== JSON.stringify(input.data.sourceIds)
    )
      throw new BadGatewayException('监测配置响应与请求不一致');
    return result;
  }
  @Post('task') async createTask(@Body() body: unknown) {
    const input = ruleMonitorTaskSchema.safeParse(body);
    if (!input.success) throw new BadRequestException('请提供有效的检查来源和配置修订');
    const result = await this.forward('/task', ruleMonitorConfigResponseSchema, {
      method: 'POST',
      body: JSON.stringify(input.data),
    });
    if (
      !result.config.taskCreated ||
      result.config.revision !== input.data.expectedRevision + 1 ||
      JSON.stringify(result.config.sourceIds) !== JSON.stringify(input.data.sourceIds)
    )
      throw new BadGatewayException('监测任务响应与请求不一致');
    return result;
  }
  @Put('schedule') async schedule(@Body() body: unknown) {
    const input = ruleMonitorScheduleSchema.safeParse(body);
    if (!input.success) throw new BadRequestException('请提供有效的执行时间、时区和配置修订');
    const result = await this.forward('/schedule', ruleMonitorConfigResponseSchema, {
      method: 'PUT',
      body: JSON.stringify(input.data),
    });
    if (
      result.config.revision !== input.data.expectedRevision + 1 ||
      result.config.cron !== input.data.cron ||
      result.config.timezone !== input.data.timezone
    )
      throw new BadGatewayException('监测执行时间响应与请求不一致');
    return result;
  }
  @Post('checks') async check(@Body() body: unknown) {
    const input = ruleMonitorCheckSchema.safeParse(body);
    if (!input.success) throw new BadRequestException('请提供有效的监测来源和请求标识');
    const result = await this.forward('/checks', ruleMonitorJobResponseSchema, {
      method: 'POST',
      body: JSON.stringify(input.data),
    });
    if (
      result.run.id !== input.data.requestId ||
      JSON.stringify(result.run.sourceIds) !== JSON.stringify(input.data.sourceIds)
    )
      throw new BadGatewayException('监测任务响应与请求不一致');
    return result;
  }
  @Get('checks/:identity') @Header('Cache-Control', 'no-store') async job(
    @Param('identity') identity: string,
  ) {
    if (!ruleMonitorJobIdSchema.safeParse(identity).success)
      throw new BadRequestException('监测任务标识无效');
    const result = await this.forward(
      `/checks/${encodeURIComponent(identity)}`,
      ruleMonitorJobResponseSchema,
    );
    if (result.run.id !== identity) throw new BadGatewayException('监测任务身份不一致');
    return result;
  }
  @Get('versions') @Header('Cache-Control', 'no-store') async versions(
    @Query('kind') kind: string,
    @Query('identity') identity: string,
  ) {
    if (!['pack', 'document'].includes(kind) || !identity || identity.length > 2048)
      throw new BadRequestException('请选择有效的资料版本记录');
    const result = await this.forward(
      `/versions?${new URLSearchParams({ kind, identity })}`,
      ruleMonitorVersionsSchema,
    );
    if (result.kind !== kind || result.identity !== identity)
      throw new BadGatewayException('监测版本资料身份不一致');
    return result;
  }
  @Get('version') @Header('Cache-Control', 'no-store') async versionDetail(
    @Query('kind') kind: string,
    @Query('identity') identity: string,
    @Query('contentHash') contentHash: string,
    @Query('baseHash') baseHash?: string,
  ) {
    const input = ruleMonitorVersionRequestSchema.safeParse({
      kind,
      identity,
      contentHash,
      baseHash,
    });
    if (!input.success) throw new BadRequestException('请选择有效的资料版本与比较基准');
    const params = new URLSearchParams({ kind, identity, contentHash });
    if (baseHash) params.set('baseHash', baseHash);
    const result = await this.forward(`/version?${params}`, ruleMonitorVersionDetailSchema);
    if (
      result.kind !== kind ||
      result.identity !== identity ||
      result.contentHash !== contentHash ||
      (result.comparison?.baseHash ?? undefined) !== baseHash
    )
      throw new BadGatewayException('正文或比较版本身份不一致');
    return result;
  }
}

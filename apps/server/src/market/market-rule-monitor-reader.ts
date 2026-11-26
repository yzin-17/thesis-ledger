import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ruleMonitorHistorySchema, ruleMonitorStatusSchema } from '@thesis-ledger/schemas';
import { DsaClient } from '../integration/dsa/dsa.client.js';

const root = '/api/v1/thesis-ledger/control/rule-monitor';

/** Market拥有来源监测事实；自动化只消费只读投影。 */
@Injectable()
export class MarketRuleMonitorReader {
  constructor(private readonly dsa: DsaClient) {}

  async status() {
    const raw = await this.dsa.control<unknown>(
      root,
      undefined,
      1,
      undefined,
      Math.min(this.dsa.timeoutMs, 5000),
    );
    const parsed = ruleMonitorStatusSchema.safeParse(raw);
    if (!parsed.success) throw new ServiceUnavailableException('资料监测状态响应无效');
    return parsed.data;
  }

  async history(offset: number, limit: number, issuesOnly = false) {
    const query = new URLSearchParams({
      offset: String(offset),
      limit: String(limit),
      issuesOnly: String(issuesOnly),
    });
    const raw = await this.dsa.control<unknown>(
      `${root}/history?${query}`,
      undefined,
      1,
      undefined,
      Math.min(this.dsa.timeoutMs, 5000),
    );
    const parsed = ruleMonitorHistorySchema.safeParse(raw);
    if (!parsed.success || parsed.data.offset !== offset || parsed.data.limit !== limit)
      throw new ServiceUnavailableException('资料监测历史响应无效');
    return parsed.data;
  }
}

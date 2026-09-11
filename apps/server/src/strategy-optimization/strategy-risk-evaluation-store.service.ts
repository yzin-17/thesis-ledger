import { Injectable } from '@nestjs/common';
import type {
  StrategyMonitoringEvaluation,
  StrategyMonitoringPlan,
} from '@thesis-ledger/domain';
import { RiskService } from '../risk/risk.service.js';
import type { StrategyRiskApplicationRow } from './strategy-risk-application.types.js';

/**
 * 兼容旧的 StrategyRiskApplicationService.evaluate 调用点。
 *
 * 策略来源规则的运行时持久化、去重与通知已经统一收口到 RiskService；
 * 这里不再维护第二套 RiskEvent / NotificationDelivery 实现。
 */
@Injectable()
export class StrategyRiskEvaluationStoreService {
  constructor(private readonly risk: RiskService) {}

  async persist(
    application: StrategyRiskApplicationRow,
    _plan: StrategyMonitoringPlan,
    _evaluations: StrategyMonitoringEvaluation[],
  ) {
    const result = await this.risk.evaluateStrategyApplication(application.id);
    return result.persistedEvents;
  }
}

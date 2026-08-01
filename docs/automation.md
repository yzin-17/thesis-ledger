# 自动化与日报运维

## 调度与幂等

`AutomationJob` 保存类型、cron、timezone、启停状态、retryPolicy、lock TTL、lastRunAt 和 nextRunAt；服务启动后从数据库恢复任务配置。执行前使用 Redis NX 锁，同一 job 在同一时间窗口只有一个实例，`AutomationRun` 保存 traceId、attempt、开始/结束时间、结果摘要和错误。

市场任务（行情同步、组合快照、风险扫描和日报）在交易日感知检查后执行；周末或休市日返回“休市日跳过市场任务”，普通维护任务仍可运行。失败按 retryPolicy 指数退避，永久错误进入 failed，不会伪造成功数据。

## 工作流

盘前流程只筛选当前持仓/自选相关公告、财报、分红和停复牌事件，并以昨日收盘或最新可用时点运行风险预览。开盘扫描只使用可用 Quote，明确无 L2 限制；盘中风险扫描批量处理持仓，复用 Market、Portfolio、Risk 服务和 Provider 限流。数据健康任务检查 Provider 状态、陈旧行情和未解决质量问题，严重问题生成 system alert。

收盘先增量同步持仓、自选和策略所需日线，再生成 Portfolio Snapshot、Daily Risk Summary 和投资日报。日报包含总资产、收益、基准超额、贡献/拖累、风险、重要事件和带引用的 AI 总结；周报按明确交易日区间生成收益/回撤/行为摘要，策略周报只能写入 research/decision-log，不修改策略。

## 失败排查

先查询 `/api/v1/automations` 的 `enabled/nextRunAt`，再查 `/api/v1/automations/history?jobId=...` 的最近 `status/error/traceId/attempt`。如果 nextRunAt 正确但没有 run，检查交易日判断和 Redis 锁；如果 run 为 failed，按 error 判断 Provider、数据库、通知或权限问题。重新触发前先确认上一条 run 已释放锁，避免重复发送日报。

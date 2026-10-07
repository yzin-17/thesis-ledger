# S06 统一依赖计划核验

`backtest-dependency-plan.ts` 为无网络、数据库、缓存与文件访问的纯计划器，组合价格和事件依赖，保留历史性质、规则转换和预热范围。快照输入计划、依赖验证与离线完整性校验共用该入口；AI 的 `StrategyOptimizationRunService` 通过 `BacktestConfiguredRunService.resolve` 消费相同计划。

最近 backtest 全目录记录中 `backtest-dependency-plan.test.ts` 10 项通过，输入未变：信号/执行/默认与显式基准、FX、身份、会话及预热；无事件归一化策略不取事件表；raw 事件缺生效日拒绝；事件信号需要独立策略可见性，不能用 Provider 可用时间替代；覆盖不足拒绝；B01 事实缺失保留 pending，转换与冻结坐标不一致拒绝。对应配置装配、快照依赖和完整快照测试亦已通过，见 S09 和 C03 证据。

C03/B01 前置项已完成，S06 范围通过。此结论不证明来源覆盖或真实事件可见性已具备，计划中的 pending/blocked 继续保留。

本轮补跑 `market-bar-reader-v3`、`market-window-selector-v3`、`market-frozen-window-reader-v3`、`market-bar-reader-v3-delegation` 四个 Server 测试文件，共 27 项通过，覆盖严格目标、实际 provenance、缺窗备用需证明、过期/未知单位证明拒绝和窗口身份。S04/S05 仍依赖 S03 的版本缓存及隔离数据库条件，保持开放；S08 因此前置未关闭亦保持开放。I01 既有数据库存储后摘要差异及耗尽重试记录继续有效，不以夹具测试覆盖或重置。

本轮未改生产代码或部署，未调用真实 Provider。证据文档首次写入因补丁上下文顺序失败，核对文件状态后重新写入成功，不影响测试结果。

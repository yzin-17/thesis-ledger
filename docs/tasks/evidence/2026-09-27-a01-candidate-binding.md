# A01 候选绑定补验

核对 `BacktestConfiguredRunService.resolve`：仅候选显式开启 rebindStrategyInputs 时按统一依赖计划重建信号别名；完整输入计划验证在 Reader 与控制面读取之前。原始协议、区间及其他配置继续保留，普通预检不替调用方修复错误绑定。幂等匹配在在线预检前返回，配置不同仍拒绝。

新增候选信号更名回归，断言完整返回配置只有 priceInputBindings 改变、传入配置不被修改、预检不创建任务。既有测试覆盖移除信号、跨标的拒绝、冻结预热预算、普通错误绑定、源修订不自动替换、离线幂等和控制面失败。

`backtest-configured-run.test.ts` 9 项与 `strategy-optimization-versioned-run.test.ts` 3 项，共 12 项通过。后者验证预检通过后才申请预算、协议不兼容不占用 Run 预算、已有幂等任务不重复创建。父窗口复用仍以已有 `v3-frozen-comparison` 4 项证据为准，更名测试不单独证明真实数据库窗口冻结。

本轮只增加测试，不改生产代码或部署，不调用模型。A01 整体仍依赖未完成的 S08，故不能关闭父项。

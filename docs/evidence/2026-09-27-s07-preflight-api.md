# S07 联合预检接口实施

## 已实现

`POST /backtests/run-config/preflight` 接收严格的 V3 请求合同：请求标识、已存储策略版本和完整运行配置。服务端复用当前同坐标价格依赖计划，检查执行行情及日历、证券事实、按需事件；返回前通过既有创建守卫重新读取策略和路由，修订变化或不可用时拒绝返回就绪。

输入不改变既定来源价格协议。接口不调用运行服务、Snapshot Store 或 AI，也不创建任务。非价格检查沿用冻结验证；执行行情不通过时直接返回其诊断。已通过的预检不替代创建/冻结时的再次验证。

客户端新增 `backtests.preflightRunConfig`，严格解析既有 V3 预检结果。将配置准备与预检传输提取到 `backtest-run-config-client.ts`，保留 `prepareRunConfig` 原接口并缩减入口文件本轮改动后的规模。没有引入新的跨 feature 依赖方向；核对并运行既有 `check-boundaries.mjs`，Backtest 依赖 Market/DSA/Platform 的方向保持符合规则。

## 验证证据

- Server 定向组合：预检 API、非价格预检、执行行情预检、配置准备、创建/冻结重试，5 文件 **59 项通过**。日志：`/private/tmp/goal-s07-api-regression-20260927.log`。
- 新 API 的 7 项测试包含实际 HTTP 服务、请求额外字段拒绝、非价格失败、控制面不可用，以及检查期间策略/路由变化。依赖端口为受控替身，不是目标 Provider 或数据库。
- API Client 的版本化传输和原配置准备回归 **11 项通过**，确认请求原样传输、拒绝缺失修订的伪就绪响应。日志：`/private/tmp/goal-s07-api-client-20260927.log`。
- Schemas、API Client、Server 构建通过；Server/API Client 类型检查通过；新增源码、控制器、模块及相关合同/客户端的定向 ESLint 通过；架构边界门禁通过。
- 首轮新 API 测试因 Schemas 编译产物尚未导出新合同失败；构建 Schemas 后首次重试 7 项全部通过，后续组合回归同样通过。

## 剩余验收

当前未提交工作区完成 API 与客户端本地接线。没有部署、真实 Provider 请求、目标数据库变更、真实回测或 AI 调用。S07 父项继续保留 S04/S05 前置和真实运行态验收；U03 消费联合预检、事件失败精确能力/来源诊断完善仍需继续实施。`ready` 是本次检查通过，不是整个特性或一次回测已成功。

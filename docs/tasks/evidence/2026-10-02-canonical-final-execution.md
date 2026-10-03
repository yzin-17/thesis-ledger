# Canonical 剩余范围连续执行包

用户在 2026-10-02 要求完成全部剩余任务。本执行包接续现有 Spec/Task 与有效证据，替代逐叶等待用户发起的调度安排，不改变验收要求。

## 已完成执行阶段

- [x] U01-b：严格消费 Market Policy 生效投影、Provider Registry 与目录状态；反查 Run/Ledger 的实际客户端入口。写集为对应 Schema、Desktop API 边界及定向测试。
- [x] U02-a：Risk 场外基金上下文经现行 Market Reader 获取净值，移除直接消费无格式标记的 `FundNavPoint` 旁路。写集为 Risk 上下文、领域内查询辅助、测试和边界门禁。
- [x] U02-b：核对 Portfolio、Risk/Automation、Research/Optimization/AI、Journal、导出/备份的实际调用及拒绝路径；按发现拆出修复叶，不以扫描代替运行证据。
- [x] E04-d：在消费者就绪后清理 DSA 当前无生产引用的旧合同、别名和夹具；保留当前领域原语、非 ThesisLedger API、外部协议与不可变证据格式。每个删除组先完成引用核对及定向验证。
- [x] D01：最终结构及运行时打包输入复核，按实际输入变化选择官方最小更新入口。保留正式保数据升级/备份门禁的独立范围。
- [x] U01-c/D02：目标同源部署后进行真实客户端 Network、Console、现行读取/拒绝与生命周期验证，复用未变化的已完成业务证据，补齐变化输入对应门禁。
- [x] D03/最终 Review：残余与文档收口；核对 Spec 全部断言、每项完成条件、实际部署输入及证据有效性后更新状态。

## 实施前核对

主仓 957、DSA 293、infra 18 个 dirty 条目均保留。Context Mode 当前没有可调用工具，使用 RTK 与有界聚合，日志写入临时目录。没有提交或推送授权，不自动提交。

U02-a 已确认真实旁路：`StrategyRiskContextService.fundContext` 直接从无当前格式标记的 `FundNavPoint` 读取和计数。Market 已有当前版本及标的绑定的 `getFundNavHistory`；Risk Module 已依赖 Market Module，可单向消费，缺失来源时保留不可用而不恢复历史表。

真实客户端准备阶段：Browser 已连接，但内置浏览器对 `127.0.0.1:3000` 与 `localhost:3000` 返回 `ERR_BLOCKED_BY_CLIENT`。尚不能据此完成客户端验收；继续检查可用的浏览器表面，不放宽产品合同或以静态测试代替。

## 新发现与删除包

- U02-b 修复叶：优化分组直接读取 `BacktestJob` 并调用宽松摘要转换，测试甚至以 V2 成功记录作为正例。改为经 Backtest 完整冻结读取守卫过滤，再生成分组；正常当前记录保留，旧与损坏输入均不投影指标。优化查询属于优化领域，校验归 Backtest 所有。
- E04-d 删除叶：`api/thesis_ledger.py` 的 `_provider_name`、`_fixture_bars`、`_fixture_minute_bars` 在 DSA 生产源码及测试中无消费者；后两者只产生旧 version=1 Bar 夹具，可以删除。当前交易日历和可交易性模块虽名为 V2，却返回 version=3 并服务现行端点，保留能力并按领域重命名，删除旧模块路径及类型/响应别名，不保留转导层。
- 当前来源适配器修订、映射证据 contractVersion=1、HiThink 原生字段单位格式 v1/v2、策略 AST schemaVersion=2、账本经济 payloadVersion=1 均是不同层的现行格式，不作为旧 API 删除。实际 HTTP 仍只有 ThesisLedger 当前路径。
- 浏览器已通过 Desktop 实际 Vite 入口 `127.0.0.1:5173` 加载，代理连接真实目标 API；先前 API 端口直接导航阻断不再构成 UI 门禁阻塞，无需用户调整 Chrome。
- D03 最终跨包修复叶：`services/dsa-adapter` 的旧 Quant 能力声明、Quote/Bar Provider 路由、Partial Bar 合并与专业插件仅互相引用和被本包测试引用，主仓没有生产调用。旧 Schema 已删除后，该包仍引用 `barSchemaV1` 等，包级测试和 build 暴露遗漏。删除 `provider.ts`、`professional.ts`、`capability.ts` 及旧合同测试/导出；保留独立凭证加密和日期计算原语及其原测试。本包不再拥有 ThesisLedger Market 路由或来源适配，实际 Provider 继续属于 DSA。没有修改 package manifest、lockfile、Schema 或目标 Server 运行依赖；先包级验证，再最终边界反查。

全部阶段已完成，最终命令、目标身份、真实交互及完整 Spec 对账见[收口证据](2026-10-02-canonical-final-completion.md)。

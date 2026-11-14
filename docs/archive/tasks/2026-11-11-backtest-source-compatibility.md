# 回测日线来源适用性任务

规格：[回测日线来源适用性](../specs/2026-11-11-backtest-source-compatibility.md)。

## 当前状态

本轮有界排查与适配修复已完成。最终复核目录共 26 个相关精确绑定；6 个提供方、10 个前复权绑定及 BaoStock 后复权在完整 28 会话窗口通过，新增通过股票 EFinance、新浪、BaoStock、富途 4 个绑定。Yahoo 的真实窗口返回缺失价格，保留拒绝；未实读组合保持未验证，不计入成功。详见[检查记录](../../evidence/2026-11-11-backtest-source-compatibility.md)。运行态已通过正式最小入口同步，9 个生产输入文件与宿主哈希一致；原路由修订 197，未新建业务任务或改写历史。

## 任务与依赖

- [x] T1：来源库存与基线原因矩阵，对应 AC-01。
  - 输入：当前 Provider 配置、精确能力目录、既有 `check_provider` 与精确读取器。
  - 范围：当前已启用、已配置的相关来源；先使用现有精确只读检查，不保存主备策略。
  - 完成条件：按精确绑定记录实际尝试、失败阶段、稳定原因及后续修复边界。
- [x] T2：完整用户窗口的有界诊断，对应 AC-02。
  - 依赖：T1。
  - 主执行面：DSA 既有诊断及生产日线绑定；需要补充的脚本或服务以生产校验为唯一依据。
  - 完成条件：固定输入、逻辑预算、脱敏输出和控制状态不变均有测试；诊断不授予准入。
- [x] T3：修复确定的适配缺口，对应 AC-03。
  - 依赖：T1；针对完整窗口的修复验收依赖 T2。
  - T1 后按实际缺陷拆成提供方独立的执行项，不先假定所有失败都可在代码中解决。
  - 完成条件：每项修复都有正常与拒绝用例，并保持既有来源合同。
  - [x] T3a：将 EFinance、AkShare、BaoStock、富途、YFinance 的已支持 CN 复权绑定接入既有研究日历语义；补齐 HiThink／腾讯已支持但未接入的复权绑定。以共享 CN 身份校验约束标的，不扩展未注册口径、资产、市场或原始份额能力；普通严格请求继续要求已知上市事实。
  - [x] T3b：多窗口编排直接消费覆盖上下文的 `expectedPostListingSessionDates`，避免已允许上市日期未知的研究请求被 `firstTradingDate` 取值异常挡住；已知上市日、严格覆盖、分页和窗口重叠校验保持。
  - [x] T3c：以修正后的诊断入口确认东方财富及其他实际读取失败原因；只修复可验证的本地缺口，外部网络、权限或无数据保留阻断证据。
- [x] T4：目标运行态及最终对账，对应 AC-04、AC-05。
  - 依赖：已完成的 T2 及相应 T3 修复项。
  - 完成条件：正式入口更新、实际精确窗口结果、不可用原因与限制形成独立证据；原策略与路由保持。

## 执行入口

- `daily-stock-analysis/src/services/thesis_ledger_provider_exact_checks.py`
- `daily-stock-analysis/src/services/thesis_ledger_exact_probe_read.py`
- `daily-stock-analysis/src/services/thesis_ledger_capability_sources.py`
- `daily-stock-analysis/src/services/thesis_ledger_market_v3_facts.py`
- `daily-stock-analysis/src/services/thesis_ledger_research_calendar.py`
- `thesis-ledger/apps/server/src/market/market-bar-reader-v3.ts`
- `thesis-ledger/apps/server/src/backtest/backtest-preflight-v3-execution.ts`

本任务不包含历史回测重写、价格口径恢复、股票公司行动适配扩建或新增付费权限。

## 最终一致性核对

- 1192 项相关合同回归的 4 个范围预期更新后，对应 22 项全部复验；诊断补充后的最终 75 项定向与宿主入口 3 项通过。语法、能力边界、运行时合同、数据测试登记和空白检查通过。
- 正式入口在 Infra 执行 `./scripts/sync-code.sh dsa`，退出 0；DSA 健康且完整真实窗口独立通过。镜像未更新，未构建或发布新镜像，未提交或推送。
- 实际来源逻辑读取 24 次，全部提供方不超过 4 次；诊断副本清理、脱敏及控制状态未改变均有测试和真实输出。Yahoo 缺失价格是记录的外部数据限制，不以补造或删除无效价格达成通过。
- AC-01 至 AC-05 的本轮完成条件均满足；其他口径、标的和未实读绑定没有获得成功结论。长期合同和诊断使用方法由 DSA 的市场日历设计维护，本任务不再持有后续执行义务。

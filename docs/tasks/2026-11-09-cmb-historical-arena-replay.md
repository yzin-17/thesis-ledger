# 招商银行真实历史模拟成交回放任务

## 当前状态

真实历史模拟成交已发布：比赛 `851546e2-4203-4240-8e96-1627f9851650`，Qwen 买入 700 股、Gemma 买入 400 股，价格均为 42.58。轮次报告、全部/分模型点位与 Desktop 日期投影已对账；未新增模型调用，原比赛和真实/影子账本不变。实际浏览器控制持续超时，R4 视觉验收尚未完成。[规格](../specs/2026-11-09-cmb-historical-arena-replay.md)与[实施证据](../evidence/2026-11-09-cmb-historical-arena-replay.md)为继续依据。原有 [11 月 10 日试跑](../evidence/2026-11-09-cmb-single-round-scheduled.md)仍在运行。

## 执行清单

- [x] R1：核实源证据与合同（AC1、AC2）。封存双模型有效回执；同花顺真实不复权日线、开盘快照、分钟旁证、上交所完整停复牌记录及当日正常上市概况交叉核对，规则正式原件及暂缓附件摘要核实。后取事实保留真实可用时间，不进入原决策。
- [x] R2：历史执行证据和撮合重建（AC2、AC3），依赖 R1。离线来源校验归 DSA，7 项定向测试与测试范围门禁通过；infra 维护入口每次从原件重验资格，消费该事实后直接复用既有 Arena 生产撮合计算。不增加实时 Market 读取旁路，范围仅为当日已核实的初始现金买入回放。
- [x] R3：幂等发布回放与 API 对账（AC1、AC3、AC4），依赖 R2。事务回滚演练、新回放发布、已知报告字段格式修复与重复执行核验通过；提交前验证真实报告合同。真实 HTTP 轮次和两笔点位逐模型一致，原比赛与账本计数保持不变。
- [ ] R4：目标运行态与浏览器验收（AC4、AC5），依赖 R3。实际 API 与真实数据的 Desktop 点位日期映射已通过；此次只运行离线校验与维护入口，没有服务源码、依赖或结构变更，无需快更或重建。浏览器控制创建/读取本地页及连接清单持续超时，尚缺 1440/1024/768/390 的实际图表标记、筛选、提示、跳转与周期/缩放验收；静态投影不能替代。

## 继续入口

- 原决策：`.recovery-artifacts/arena-replays/1699f93b-2c2c-4ffc-9ee1-ca806e40d45f.receipt.json`。
- 原开盘诊断：`.recovery-artifacts/arena-immediate-news-20261106/opening-2026-11-09.json`。
- Market：`apps/server/src/market/market-open-evidence.ts`、`market-lifecycle-reader-v3.ts`。
- Arena：`apps/server/src/model-arena/arena-open-execution.ts`、`arena-round-report.ts`。
- DSA：`src/services/thesis_ledger_dependency_facts.py`、`thesis_ledger_trading_status.py`。
- infra：`scripts/model-arena-replay.mjs` 与 `model-arena-replay-runtime.mjs`（现有入口仅生成文件回执，不能证明比赛成交已入库）。

当前工作区存在大量既有未提交变更，保持原状；不提交、不重置、不覆盖历史失败事实。外部来源、运行时和浏览器各层结果独立记录，所有验收缺口继续由本任务持有。

## 当前继续检查点

R4：恢复浏览器控制后，打开[实际轮次报告](http://localhost:5173/strategy/arena/851546e2-4203-4240-8e96-1627f9851650/d8b96449-415c-443e-843e-33f2c40c5463)，再到招商银行日线图选择“招商银行 · 历史成交回放（复用11月6日决策）”。全部模型应有两个 11 月 9 日买入点，Qwen/Gemma 分别筛选为 700/400 股、42.58。保留已有入库和接口证据，不重新调用模型或重复抓取来源；回放已发布，不需要再次导入。缩放、周期切换及同日两个标记的视觉表现尚待核实。

## 最终一致性 Review

- 已核对授权范围、来源职责、历史时点及原件哈希、独立模拟账和重复执行边界；R1–R3 的本地与运行态证据支持所声明结果。
- 新增职责仅为离线来源校验与维护工具；没有修改 Server feature import/export 或新增跨 feature 依赖，模块边界门禁无需变更。没有数据库结构、客户端原生依赖或镜像输入变更。
- 原报告字段错误已精确修复并记录，真实 API 现已验证通过；没有把既有失败历史改写为成功。
- 结论：**部分验收通过，整体仍受 R4 浏览器视觉检查阻塞**。任务保持活动，不归档，不将此项移入 TODO。

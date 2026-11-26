# 招商银行真实历史模拟成交回放任务

## 当前状态

真实历史模拟成交已发布。比赛 `851546e2-4203-4240-8e96-1627f9851650` 中，Qwen 买入 700 股、Gemma 买入 400 股，价格均为 42.58 元。四宽实际浏览器验收于 2026-11-22 通过。本次复用原始行情、已发布成交和报告，新增模型调用和回放发布均为 0。[规格](../../specs/2026-11-09-cmb-historical-arena-replay.md) · [实施证据](../../evidence/2026-11-09-cmb-historical-arena-replay.md) · [11 月 10 日独立试跑](../../evidence/2026-11-09-cmb-single-round-scheduled.md)

## 执行清单

- [x] R1：核实源证据与合同（AC1、AC2）。封存双模型有效回执；同花顺真实不复权日线、开盘快照、分钟旁证、上交所完整停复牌记录及当日正常上市概况交叉核对，规则正式原件及暂缓附件摘要核实。后取事实保留真实可用时间，不进入原决策。
- [x] R2：历史执行证据和撮合重建（AC2、AC3），依赖 R1。离线来源校验归 DSA，7 项定向测试与测试范围门禁通过；infra 维护入口每次从原件重验资格，消费该事实后直接复用既有 Arena 生产撮合计算。不增加实时 Market 读取旁路，范围仅为当日已核实的初始现金买入回放。
- [x] R3：幂等发布回放与 API 对账（AC1、AC3、AC4），依赖 R2。事务回滚演练、新回放发布、已知报告字段格式修复与重复执行核验通过；提交前验证真实报告合同。真实 HTTP 轮次和两笔点位逐模型一致，原比赛与账本计数保持不变。
- [x] R4 目标运行态与浏览器验收（AC4、AC5）。原浏览器连接超时保留在证据。现用 Chromium 在 1440／1024／768／390 验证真实应用自选入口，取目标点位、分模型结果及轮次报告，使用原冻结价格。通过当日标记、分别筛选、悬浮或触摸、周期、缩放及原报告返回。同日两笔按方向合并为一个空心箭头，明细逐笔保留。[实际浏览器回执](../../evidence/2026-11-09-cmb-historical-arena-replay.md#2026-11-22-实际浏览器验收)

## 继续入口

- 原决策：`.recovery-artifacts/arena-replays/1699f93b-2c2c-4ffc-9ee1-ca806e40d45f.receipt.json`。
- 原开盘诊断：`.recovery-artifacts/arena-immediate-news-20261106/opening-2026-11-09.json`。
- Market：`apps/server/src/market/market-open-evidence.ts`、`market-lifecycle-reader-v3.ts`。
- Arena：`apps/server/src/model-arena/arena-open-execution.ts`、`arena-round-report.ts`。
- DSA：`src/services/thesis_ledger_dependency_facts.py`、`thesis_ledger_trading_status.py`。
- infra：`scripts/model-arena-replay.mjs` 与 `model-arena-replay-runtime.mjs`（现有入口仅生成文件回执，不能证明比赛成交已入库）。

## 查看入口

在招商银行日线图打开“模型模拟买卖点”，选择“招商银行 · 历史成交回放（复用11月6日决策）”。全部模型显示两笔 11 月 9 日买入，按模型可查 700 股及 400 股两份明细。[实际轮次报告](http://localhost:5173/strategy/arena/851546e2-4203-4240-8e96-1627f9851650/d8b96449-415c-443e-843e-33f2c40c5463)

## 最终一致性 Review

- 已核对授权范围、来源职责、历史时点及原件哈希、独立模拟账和重复执行边界；R1–R3 的本地与运行态证据支持所声明结果。
- 新增职责仅为离线来源校验与维护工具；没有修改 Server feature import/export 或新增跨 feature 依赖，模块边界门禁无需变更。没有数据库结构、客户端原生依赖或镜像输入变更。
- 原报告字段错误、原浏览器超时及两轮各自通过的回执均保留。图表共用修复随 C3 验收。
- R1–R4 和 AC1–AC5 全部完成。2026-11-22 归档。

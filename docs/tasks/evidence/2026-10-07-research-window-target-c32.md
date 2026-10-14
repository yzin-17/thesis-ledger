# C3.2：两只股票扩展窗口真实准备与回测

> 日期：2026-10-07
> 对应任务：[C3 目标验收](../../archive/tasks/2026-10-03-multi-source-remaining-acceptance.md)
> 结论：本叶通过。两只股票均通过目标标准 API 完成准备、创建与持久成功终态，扩展窗口、费用模型兜底及未知上市披露符合预期。C3.3 两次离线 Runner 重放与独立复算、C3.4 页面验收仍未执行，C3 父项及 PR-AC07 保持未验收。

## 场景与显式模型

标的为 600000.SH、600519.SH，运行日期 2023-08-01～09-15。策略用收盘价高于 MA5 入场、低于 MA5 离场，下一可成交日开盘执行，无额外风险规则。初始 CNY 100000、每次参与金额 CNY 10000、零滑点；价格使用腾讯原生 qfq、固定供应商快照、连续归一化单位，不应用整手、价位或日涨跌幅限制。

五日预热预算显式传入，使用 `after-acquisition` 冻结时间策略；五日是本场景的指标预算，实际保守请求提供更多预热数据。模型覆盖整个运行区间且仅有一个分段：佣金双向 0.0003、每笔最低 CNY 5，印花税卖出 0.0005，过户费双向 0.00001；规费、经手费包含在佣金内。每项应用最低额后按 CNY 两位小数 halfUp 舍入。成交后首个交易日可卖、卖出资金当日可再投资。

上述费率是本次明确选择的研究设置；整窗 0.0005 印花税没有模拟 8 月 28 日前后的历史费率变化。公共包只覆盖原有短窗口，未拼接或外推到本次区间，净收益不标为券商真实现金收益。

## 目标版本、执行入口与持久身份

复用 C3.1 目标，不执行部署或数据库结构操作。“历史市场规则来源核验”确认 P5 已收口，本窗口保持共享生产源码和目标运行态。先运行只读 `research-window-target-check.mjs`，25 项运行文件与当前宿主产物一致，policy40／dsaRevision40／applied、8 条路由以及旧任务保持。

新增 [research-window-target.mjs](../../../scripts/research-window-target.mjs)，两只股票的离线计划均通过实际 Schema 解析；随后逐只执行：

```sh
rtk proxy node scripts/research-window-target.mjs --symbol=600000.SH --run
rtk proxy node scripts/research-window-target.mjs --symbol=600519.SH --run
```

两项均退出 0。入口仅通过标准 `/api/v1/backtests/strategies`、`/run-config/prepare`、`/runs` 创建独立策略、准备输入并读取业务终态，没有修改 Provider 或 policy。每项准备为 prepared／ready，已选完整模型逐项保持；实际策略、请求和结果摘要见 [稳定输入记录](2026-10-07-research-window-target-c32-input.json)。

| 身份 | 600000.SH | 600519.SH |
| --- | --- | --- |
| 策略 | `d25142de-a46a-4086-9b9b-eda58c2d4e72` | `e840276a-a18f-4792-8b5a-c3953f4cc269` |
| 策略版本 | `5178af06-77ef-42f6-9bbd-0a7e0fed7bfe` | `26176553-5529-441c-a998-403ddbbb0e44` |
| 任务 | `73ab7c23-9335-4771-a612-5f1a1547734f` | `dbc39963-da96-4583-8746-01feac9c7ff2` |
| 持久状态 | succeeded／executionAttempt1 | succeeded／executionAttempt1 |
| Snapshot | `5f29b4e001bb08fd2ab4cac3463efab5522d093269f343f613926c5ec1f3b701` | `96e96f97bc6a3582590018b870431d22e4d94e2c9f4d0c93f6359186a19966e0` |
| 结果校验和 | `1e83d3eb24788bcf` | `022494dccd271850` |
| 完整性 | complete | complete |

之后独立 GET 再读，两份完整业务 API JSON 与运行时保存结果逐项一致。终态来自持久记录，未将队列状态或健康作为业务成功证据。

## 冻结窗口、日历及上市信息

新增只读 [research-window-artifacts.mjs](../../../scripts/research-window-artifacts.mjs)，通过 `docker exec -i -w /app … node --input-type=module - <任务ID> <标的>` 从 stdin 执行；不复制或保存容器文件。两项均退出 0，每个 finalized Snapshot 的 10 项冻结产物可读，校验完整性通过；未执行 Runner，网络计数为 0。

两份冻结价格请求均为 2023-07-08～09-15，显式 `assume-untradable-no-bar`、CN STOCK／日线／qfq、Tencent／Tencent／routeIndex0，来源 policy40。分页记录为 1 页、完成且无待续页。各 50 根日线覆盖 07-10～09-15，16 根早于运行起点，34 根处于运行区间，与冻结日历的预期日期逐项一致，实际缺日为 0。准备、RunConfig、manifest 和冻结证据的窗口引用相等，Builder 使用同一冻结身份。

冻结日历来自 `exchange-calendars-4.13.2-release-evidence-v1`，availableAt 为 `2026-03-10T03:24:37.055242+00:00`，区间 07-08～10-02；末日成交后的首个交易日为 **2023-09-18**，结算覆盖有效。该现行日历证据不作为严格历史 PIT 证明。

600000.SH 保留 1999-11-10 及原公告来源、revision、knownAt。600519.SH 在冻结覆盖合同中保持 `{symbol:"600519.SH",status:"unknown"}`，成功结果包含：

> 未获取上市日期，未验证回测窗口与上市日期的边界关系

600000.SH 不包含这条未知提示。两只股票的真实停复牌源均未覆盖本场景，冻结披露为 `notIncluded`，结果明确说明未纳入真实状态约束、沿用普通研究假设；没有把有价格的日期推断为完整历史状态证明。

## 整窗费用兜底与净收益

两份收费产物均为 `executionModel`，模型内容哈希与冻结执行模型及 RunConfig 一致；完整模型在准备、持久输入和冻结元数据中逐项保持，未混入短窗口公共费用。补充通过真实 DSA HTTP 读取两只股票的主、备用源共 4 项整窗请求，均返回 **HTTP503／`insufficient_coverage`／“公共收费包未覆盖请求日期”**；原始请求及拒绝记录已保存。按实际业务错误码记录，不将其记为已覆盖。

结果费用说明为“公共收费源暂不可用，使用已选执行模型。”策略与基准均使用同一冻结模型，兼容状态为 compatible，成本版本保持 `execution-model-cost-v1`，各自兼容指纹一致。

| 核对项 | 600000.SH | 600519.SH |
| --- | --- | --- |
| 模拟成交／已平仓交易 | 11／5 | 8／4 |
| 策略逐笔费用合计 | CNY 80.69 | CNY 60.78 |
| 期末净资产 | CNY 99148.53268573805071295162402767782399348424263 | CNY 99913.902543304415228090373856654163598524684442 |
| 策略净收益 | −0.851467% | −0.086097% |
| 基准净收益 | −7.545494% | −6.270828% |
| 净收益差 | +6.694027 个百分点 | +6.184731 个百分点 |
| 成本指纹 | `492c2c101f6e906f` | `43ded329941a4f7c` |

以上收益取自持久结果，费用合计为逐笔 charge 金额之和；完整精度见稳定输入记录。本叶验证实际净收益、基准可用及兼容，逐笔独立计费、现金与持仓估值复算归 C3.3，不将当前汇总冒充独立计算验收。

## 保护、验证与下一叶

每项运行前后独立读取 policy，revision、dsaRevision、syncState 和 8 条路由对象相同。旧 B4 complete 任务 `873ba8dd-40c3-4f9e-b1d5-b16192f697b0` 与旧 partial 任务 `652ba051-a4c5-493d-81e6-2cdbe3c090f0` 的完整 API JSON 在每项前后逐项相同，Snapshot 和 checksum 分别保持原值；没有重写旧结果。

两份新增脚本 syntax、Prettier 检查，以及离线 Schema 计划、真实目标运行、冻结产物只读断言均通过。没有修改生产代码、依赖、Schema 或迁移，没有重复包级测试或镜像构建。原始目标报告保存在 `/private/tmp/thesis-c32-run-600000.json` 和 `/private/tmp/thesis-c32-run-600519.json`，路径与 SHA-256 已收入稳定输入记录。

本叶范围及证据一致，C3.2 勾选。下一项 C3.3 使用这两份已冻结 Snapshot，各执行两次无网络 Runner 重放并独立复算，不重新采集；C3.4 再完成真实页面及诊断下载。P5 已有独立完成记录保持，C3 父项及 PR-AC07 仍未完成。未提交、推送，未执行 Electron、Mobile、严格 PIT 或不可变镜像发布验收。

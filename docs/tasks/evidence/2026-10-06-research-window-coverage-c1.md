# C1：普通股票与日期覆盖限制归因

> 日期：2026-10-06。对应[普通研究窗口任务](../../archive/tasks/2026-10-03-multi-source-remaining-acceptance.md#research-next-queue)与[覆盖策略](../../specs/2026-10-03-multi-source-remaining-acceptance.md#research-window-policy)。
> 结论：C1 调查完成。两只股票的扩展窗口实际可读；当前限制主要来自覆盖证明所用的有限日历、强制上市事实与收费包范围。先修复现行日历接缝，上市事实的研究分支另行实施。尚未扩大产品的已验收支持范围。

## 范围与协作

用户在确认冲突边界后要求继续 C1。开始时主仓 646、DSA 56、infra 49 个未提交路径全部保留；未提交、推送或清理。本轮只修改本主题 Task 和本报告，不修改生产代码、共享 Schema、Provider、路由、数据库、Docker 或 Vite，不创建目标回测。

已向“历史市场规则来源核验”说明本次只读边界；该对话继续 P5.3b 的快照、执行和结果消费验证，本次不占用其写集或目标窗口。读取当前源码只说明调查时的事实；后续实施前仍需检查并行修改。

## 真实样本与必要日期

只使用已有腾讯原生日线适配器 `fetch_tencent_native_daily`，没有启用已跳过来源或新增付费接口。固定协议为 `CN/STOCK/DAILY_BAR/1d/qfq`，研究窗口为 **2023-08-01～2023-09-15**。

| 样本 | 整体请求范围 | 实际日线 | 研究窗口日线 | 8 月 1 日前预热日线 | 与现行日历比较 |
| --- | --- | --- | --- | --- | --- |
| 600000.SH | 2023-07-08～2023-09-15 | 50 根，7 月 10 日～9 月 15 日 | 34 根 | 16 根 | 无缺日，无额外日期 |
| 600519.SH | 同上 | 50 根，7 月 10 日～9 月 15 日 | 34 根 | 16 根 | 无缺日，无额外日期 |

第一次探测请求 7 月 20 日～9 月 15 日，两只各取得 42 根；随后检查实际预热规划发现不能把这次短请求当作正式准备窗口。`backtest-dependency-price.ts` 采用 `requiredSessions * 2 + 14` 个自然日的保守回看：零回看需求仍请求到 **7 月 18 日**，显式五交易日预算请求到 **7 月 8 日**。因此补读了覆盖真实五日预算的整窗，而非修改规划或填补价格。两个请求在先前窗口内的全部规范化 OHLC、量额和日期一致。

沿用 B 队列的相对持仓条件策略可以不依赖价格预热；五日预算用于明确后续指标研究的采集输入，不声称已运行某个 SMA 策略。16 个实际交易日满足该预算，其他更长指标仍由各自规则检查。

T+1 研究模型的结算规划为末日加 `1 * 3 + 14` 个自然日，即日历请求延伸至 **2023-10-02**；实际首个后续交易日为 **2023-09-18**。这里只需日历支持结算，不需要请求截止 10 月 2 日的价格。7 月 8 日为周六，无价格正确，不是缺失交易日。

## 限制归因与所有者

| 输入 | 观察到的限制 | 本次计算是否需要 | 概念所有者与接缝 |
| --- | --- | --- | --- |
| 价格与分页 | 两股票均可取得扩展窗口；包裹、标的键、日期唯一性、正值 OHLC 和原生量额通过现有适配器校验。本样本未观察到供应商无数据 | 成交、权益和基准计算需要；身份、口径和分页校验继续保留 | DSA 腾讯日线适配器；本轮无须修改 |
| 行情覆盖日历 | `market_calendar_evidence_v3` 只登记 2023 年 8 月和 2026 年全年；跨入 2023 年 7 月或 9 月就返回空 | 时序、预热、缺日解释与结算需要真实日历；不要求同期日历版本见证才允许固定快照研究 | DSA Market coverage；第一处最小接缝为 `_market_data_v3_coverage_context` 使用的日历提供者 |
| 执行依赖日历 | 已有 `calendar_fact` 实际支持 7 月 8 日～10 月 2 日。锁定包 `exchange-calendars 4.13.2`、93 份源码摘要通过现有核验 | 必需，可复用 | DSA 依赖事实；版本 `exchange-calendars-4.13.2-release-evidence-v1`，可用时间为 2026-03-10T03:24:37.055242Z，不能据此声称 2023 年历史可见 |
| 上市事实 | 内置字典仅登记 600000.SH、159516.SZ。600519.SH 的八月日历存在，但 `market_coverage_context_v3` 仍因缺上市项返回空 | 本次持仓条件及相对价格研究不需要上市日期；上市天数或上市边界判断确实需要 | DSA 覆盖合同及 Schema/Server 消费。不是腾讯证券白名单，却通过必填证明形成了实际准入限制 |
| 公共收费 | 主包仅覆盖 8 月 23～29 日，备包仅覆盖 8 月 22～29 日；实际 Reader 对扩展窗口均报 `insufficient_coverage` | 净收益需要明确费用；不一定需要公共来源 | 历史规则 P4 已实现整窗失败后的已选模型兜底，直接复用，不外推费率、不拼接包、不默认为免费 |
| 停复牌 | 本次两个样本没有观察到日历缺日；这不证明全部窗口无停牌。缺 Bar 不能被自动标为已证实停牌 | 对真实执行有影响，未知必须披露 | P5 由另一对话接入独立状态，不由 C 队列重做 |

当前 `market_bars_v3` 在调用 Provider 之前先要求 coverage context；为空则返回 `insufficient_coverage`。因此，即使腾讯能返回有效行情，600000 的跨月请求与 600519 的八月请求仍会先被本地证明限制挡住。此结论来自当前函数调用链与实际纯函数返回值，没有把它冒称本轮新目标 HTTP 或新回测结果。

上市事实不是只删除字典检查即可解决：`marketCoverageProofV3Schema` 的必填 `listing`、规范编码、日级可交易性合同，以及 Server selector、执行 Bar 和日历对齐消费者均读取 `firstTradingDate`。不能把首根行情日期伪造成上市日期、填任意旧日期，或将空值直接传入现有合同。

## 保存身份与复核

本轮实际公开请求合计 **4 次 HTTP 200**，每只股票一个初次短窗口、一个真实预热窗口；调用已有函数，每次总期限 30 秒，没有机械重试。原文保存为 UTF-8 响应文本，摘要与该适配器的传输摘要算法一致，不声称为未经解码的网络字节。

| 正式预热窗口原文 | 字节数 | SHA-256 | 规范化 50 行 SHA-256 |
| --- | --- | --- | --- |
| 600000.SH | 52643 | `fd1d577f0267e6b86fece922476f92a3572af43deaa838feb0e1d8d4e93b69f9` | `d9d072455d1c1549fc6aeab0db0895cb9798041f0b1ccb512d4420582a348ddf` |
| 600519.SH | 60559 | `77deccadacb35682129fee5fdf9a0f757c9d9f1d9019bb36b23b16b44111b810` | `d72e65cfd7e6fd0afbaa0d88be92df5295970958fc7f70b3d41a7fad6f505696` |

采集脚本：[C1 只读采集](/private/tmp/thesis-research-coverage-c1-20261006.py)；汇总：[采集事实](/private/tmp/thesis-research-coverage-c1-warmup-20261006/summary.json)；原文：[600000](/private/tmp/thesis-research-coverage-c1-warmup-20261006/tencent-1.txt)、[600519](/private/tmp/thesis-research-coverage-c1-warmup-20261006/tencent-2.txt)。临时文件可供本机复核，长期调查结论及摘要以本报告为准，不把临时目录作为产品运行依赖。

离线脚本：[复读与费用范围检查](/private/tmp/thesis-research-coverage-c1-check-20261006.py)；结果：[离线诊断](/private/tmp/thesis-research-coverage-c1-warmup-20261006/offline-check.json)。对保存原文分别调用现有 `_parse_response` 两次，校验结果相同、两次采集的重叠窗口一致、五日预算有足够预热、实际日期与日历相等，禁用 HTTP 后调用计数为 0。公共收费主备各对两个标的执行扩展请求和旧短窗口正例：扩展均为 `insufficient_coverage`，旧窗口均为 `supported`，保持收费并非逐股票白名单的事实。

执行命令：

```sh
cd /Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis
rtk proxy env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python /private/tmp/thesis-research-coverage-c1-20261006.py
rtk proxy env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python /private/tmp/thesis-research-coverage-c1-check-20261006.py
```

两命令退出 0。没有改生产代码，所以未重跑包级测试或构建；离线解析是 C1 的样本复核，不替代 Snapshot/Runner 离线重放。后者仍为 C3 验收义务。

调查源码身份：

| 文件 | SHA-256 |
| --- | --- |
| DSA `src/services/thesis_ledger_market_v3_facts.py` | `3dba15f681d0aeafb39a961ed1b12fa7d3f4a377970c29a8167e6f4ead50ed16` |
| DSA `src/services/thesis_ledger_dependency_facts.py` | `bc28abeaf57246877c8c20cfeb1ab6629e2b1df7e6e0b19ec74d88584445910b` |
| DSA `src/services/thesis_ledger_calendar_release.py` | `1d5b5733dee42bafbaeb006600bdb7b3225199bc4a94b968cfa6193bd091a308` |
| DSA `api/thesis_ledger.py` | `ff58fc4515057c1470ebd877bf1f1de7be4ea386744d4234546d547c72f1cf85` |
| Schema `market-coverage-proof-v3.ts` | `ce2f9c94b430f09bad1270766e9bc39a48ab54c902dd73261f2ac0076050f87d` |

## 下一最小任务与审查

第一项实现固定为 **C2.1：复用现行日历解除月份限制**，入口、写集、输入和定向检查已写入 Task。它保留现有上市合同，所以只交付已知标的扩展日期的日历接缝，不把另一只股票整体通过藏在本叶中。C2.2 单独处理不需要上市字段的研究合同与消费者，涉及 P5 的共享 Schema／执行文件，实施前必须协调独占窗口；C3 才进行目标同步、真实准备／运行、冻结重放与页面验收。

C1 最终一致性审查通过：真实样本、限制所有者、预热与结算日期、费用兜底归属和下一最小接缝均有依据；没有用文档、源码发现或离线解析代替 PR-AC07 产品验收。C1 可勾选，C2/C3 与 ETF 分红、严格 PIT 等独立任务保持未完成，整项 Task 不归档、不转移到 TODO。

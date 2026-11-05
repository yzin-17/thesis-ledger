# S05 逐 Bar 日线窗口完成证据

## 状态与范围

`S05-daily-window-finish-0928 / worker_done`。基线为协调者指定的 `main / fe0e871e`，保留既有多处 WIP。按 `spec-driven-workflow` 的局部实施与检查点规则完成既有逐 Bar 草稿，仅本轮必要阶段完成，不表示 S05 全部验收或严格 PIT 准入。

本轮写入既有 `market-pit-decision-window-v3.ts` 与测试，新增获授权的 `market-pit-decision-window-source-v3.ts` 和本文。日历文件仅接受 owned 格式检查，最终内容摘要与旧检查点相同。没有修改其余源码、Schema、Spec、Task、index、配置、历史证据文件或其他代理工作，没有 stage 或 commit。协调者已明确三份命名 source 在本叶范围内，第四份或未命名 source 才需要重新拆分。

Context Mode 工具发现不可用，使用 RTK、有界输出与外部日志。使用既有精确瞬时与归档摘要领域 helper，没有新增通用工具函数或依赖，没有反向导入 Backtest。

## 最终 API 与职责

保持 `bindMarketPitDailyDecisionWindowsV3({ input, content, sourceTimes, calendars })` 及原公开类型。成功结果仅为 `decision-windows-bound`，包含复算 `barDecisionBindings`；失败为稳定 `unavailable` 理由。未知异常收敛为 `clock-invalid`，不输出任意异常文本。

主文件直接调用 `bindMarketPitReconstructionManifestV3` 绑定完整 v2 清单，核对原清单、输入及来源时钟的同序和数量，再计算逐 Bar 窗口；没有移除历史区或回落 v1。主文件负责清单引用与逐 Bar 窗口声明复算。日历文件负责连续日期、当地分钟与固定 UTC+08 瞬时关联，以及日终到第一有效后继开盘。新 source 文件负责完整归档摘要、精确作用域、去重与引用集合、Bar 内容/来源时钟关联、来源见证声明和精确时间边界。

归档的完整响应摘要用既有 `marketFrozenWindowHashV3` 重算，价格坐标、RouteKey、目标、标的、Provider、来源与序列版本保持原内容阶段的作用域合同；不同观察时间仍允许。来源时钟必须匹配实际归档和原 Bar，不能靠 `archives-bound` 或其他成功标记掩盖错标的、错摘要或篡改。只读输入没有改写；输出 `decisionAt` 始终使用原 Bar `availableAt` 文本。声明中表示同一瞬时的不同 offset 允许等价，但不改写认证原文或摘要。

首批仅消费 `CN / 1d / Asia/Shanghai` 固定 UTC+08 日内必要模型。交易日标签沿用 `timestamp.slice(0, 10)` 的既有 occurredAt 合同。最后有效时段才是完整日终，午休不是日线后继；连续休市后采用第一个真实开市日的第一时段。最后输入必须有后继证据，不要求后继价格。跨午夜、模糊映射和未支持模型拒绝。

精确比较保留全部秒以下小数：`closedAt <= sourceObservedAt <= decisionAt < nextOpenedAt` 与 `sourceObservedAt <= fetchedAt < nextOpenedAt` 均验证；日历声明与来源修订声明不得晚于对应决策时刻。输入观察、归档 Bar、逐 Bar 来源时钟及证据获取均受 `dataAsOf` 精确约束；先前已知的未来后继开盘可晚于该截点。这些是必要条件，`symbolScope`、见证中的 `revisionKnownAvailableAt` 及上游成功标记都不构成真实场所或原发布认证。

## 实际验证

旧检查点仍保持 `needs_split` 历史状态。本轮首次直接 v2 基线为 34 项、32 通过、2 失败：下一开盘决策与午休决策已经被完整 v2 Schema 提前拒绝为 `input-mismatch`，旧测试错误地要求更晚计算层的 `outside-decision-window`。本轮保留完整 binder 顺序，修正理由预期。

补充合成手算案例后，一次中间测试为 40 项、38 通过、2 失败，原因分别为合成休市 reason 不在既有枚举内、原 Bar 文本带 `.000Z` 而断言写成 `Z`；两处均按真实合同修正。中间严格 lint 曾报告 test describe 回调超 220 行，按成功边界与清单拒绝职责分成两个测试组后通过。没有放宽规则或新增 ignore。

最终依次完成下列检查，全部 exit 0；定向测试均 `--cache=false`，没有 skip：

| 检查 | 命令 | 最后结果 |
| --- | --- | --- |
| 窗口定向 | `pnpm --filter @thesis-ledger/server exec vitest run test/market/market-pit-decision-window-v3.test.ts --cache=false` | 1 文件、42/42；原 34 加新增 8 |
| owned 严格 lint | `pnpm exec eslint` 加三份 owned source 及 owned test，`--max-warnings=0 --rule 'complexity: [error, 20]' --rule 'max-lines-per-function: [error, 220]'` | 通过，零 warnings |
| owned 格式 | `pnpm exec prettier --check` 加上述四个 TS 路径 | 通过 |
| 关联定向 | `S05_CALENDAR_PUBLIC_INPUT_DIRECTORY=/private/tmp/s05-calendar-package-0928 pnpm --filter @thesis-ledger/server exec vitest run --cache=false test/market/market-pit-source-capture-v1.test.ts test/market/market-pit-reconstruction-content-v2.test.ts test/market/market-pit-reconstruction-source-times-v3.test.ts test/market/market-pit-calendar-schema-interoperability.test.ts` | 4 文件、87/87：57+12+12+6；真实 parser 输入实际可读，无 skip |
| Server 类型 | `pnpm --filter @thesis-ledger/server typecheck` | 通过 |

新增 8 项覆盖观察/抓取等值、下一开盘前极小数允许与稍晚抓取拒绝、连续周末连假、合成半日、等价 offset 与原决策文本、未支持模型、错归档作用域与完整响应摘要、冻结观察晚一微秒、未知异常稳定拒绝。旧测试继续覆盖最后无后继、午休、claim 字段篡改、错见证/错引用/乱序/数量、晚获取、修订声明晚到、证据获取晚到和输入不变性。合成半日/连假成功只证明必要算法，不扩张固定真实 parser 的支持范围。

所有进程已结束，没有待等待 session、后台服务或新网络请求。未执行全 Server 测试、Server build、全仓门禁、Provider、数据库、Docker、浏览器、运行态或最终原文准入。未签发 `historical-window-bound`、`ready` 或真实来源资格，最终 gate 继续由独立任务负责。

日志位于 `/private/tmp/s05-daily-finish-{baseline,focused,lint,format-write,format,related,type}.log`。最终四份 owned TS 输入摘要另存 `/private/tmp/s05-daily-finish-owned-hashes.json`；没有生成 cache、coverage 或测试报告产物。

## 最终文件身份

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `apps/server/src/market/market-pit-decision-window-v3.ts` | 172 | `b45bd76f660fcd25690c0ed003543a8639dce0df8b83e4ad4d4fb369af5181e2` |
| `apps/server/src/market/market-pit-decision-window-calendar-v3.ts` | 128 | `95515601c3f632abf4f3be1a1d54dd14b23379b663d368ed63b8f10824788d86` |
| `apps/server/src/market/market-pit-decision-window-source-v3.ts` | 147 | `36acd8543ff4af119d63a9e2130463fbe9871e72e21070431a3ec55e0f20effd` |
| `apps/server/test/market/market-pit-decision-window-v3.test.ts` | 448 | `a6e57d79bbddc0b5d53fefcacbc7e0097b85769e4c1756708fe1c8af1c604a4c` |

本文为新证据文件，不自引用其摘要。旧数学检查点和日历 Schema 时区证据保留不变；此轮结果使用已修复的 Schema 及已构建的实际 Schemas 包完成必要绑定。Spec/Task 台账与最终一致性验收由协调者维护。

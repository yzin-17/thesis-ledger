# S05 逐 Bar 日线窗口计算检查点

## 状态与边界

`S05-daily-window-math-0928 / needs_split`。协调者确认日历投影生产者与 v2 Schema 消费者存在必要合同冲突，并要求本叶停止，另派 fresh 任务修复 Schema UTC/当地分钟关联后再继续。本文不是 `worker_done`，不是 S05 完成或严格 PIT 准入证明。

基线为协调者提供的 `main / fe0e871e`，保留既有大量 WIP。只新增以下四个 owned 文件；未修改既有源码、Schema、Spec、Task、index 或配置，未 stage、commit、清理其他工作。

| 草稿文件 | SHA-256 |
| --- | --- |
| `apps/server/src/market/market-pit-decision-window-v3.ts` | `3dff9453cf2a0ed48a73c99c349405c25778e486ac5af24878ad55eec83e62f4` |
| `apps/server/src/market/market-pit-decision-window-calendar-v3.ts` | `95515601c3f632abf4f3be1a1d54dd14b23379b663d368ed63b8f10824788d86` |
| `apps/server/test/market/market-pit-decision-window-v3.test.ts` | `9e747fe307546d460635fc32af32bf2020ccd989ec3e18b9bdc618b2f93016d1` |
| 本文 | 检查点证据文件，不自引用摘要 |

最终源文件为 222 / 128 行。草稿仅导入 Market 与 Schemas，不反向导入 Backtest。Context Mode 工具发现不可用，使用 RTK 及有界输出。按 `spec-driven-workflow` 的实施检查点规则保留未完成工作。

## 依赖冲突与复现

只读核实的冲突路径：

1. `packages/schemas/src/market-pit-calendar-structure-v1.ts` 的 `validateDailySessions` 将 `openedAt` / `closedAt` 字符串的小时和分钟直接与 `startMinute` / `endMinute` 比较，而没有按 `timezone` 解释 UTC 瞬时。
2. 同一当地时段的 `2026-05-18T09:30:00+08:00` 对应 `startMinute=570`；真实 parser 的 `recomputeXshgPackageProjectionV1` 使用 `new Date(...).toISOString()` 输出 `2026-05-18T01:30:00.000Z`，该瞬时仍是当地 09:30。真实收盘投影同样将当地 15:00 输出为 `07:00Z`。
3. `parseMarketPitCalendarPackageV1` 成功结果携带上述复算 calendar；v2 清单通过 `marketPitHistoricalDecisionWindowV3Schema` 再绑定时，Schema 将 `01:30` 当作当地分钟 90，与 570 不等，拒绝。该生产者/消费者源码路径已核实，本叶没有运行带固定真实原文字节的注册 parser。
4. 本叶合成日历 unit fixture 使用与真实生产者一致的 UTC 时段文本：`01:30Z / 03:30Z / 05:00Z / 07:00Z`，分别声明分钟 `570 / 690 / 780 / 900`。初始全套单测 34 项中 10 项失败，必要阶段返回 `input-mismatch`；其余拒绝测试通过不能证明算法已完整通过。
5. 在 fixture 中临时增加 `marketPitReconstructionManifestV3Schema.parse(content.proof)` 后，单独运行“真实完整收盘”测试，得到 8 条 `historicalDecisionWindow` 的 `日内时段须有序、不重叠且不跨午夜` 错误，准确定位 UTC 文本与当地分钟核对冲突。诊断调用随后已移除。

复现命令：

```sh
pnpm --filter @thesis-ledger/server exec vitest run test/market/market-pit-decision-window-v3.test.ts --cache=false
```

最终草稿恢复为直接使用 `bindMarketPitReconstructionManifestV3({ ...input, proof: content.proof })`，没有移除 v2 历史区、降级 v1 或放宽最终准入。应先修复生产者/消费者合同，再重新运行本测试。

冲突输入摘要：

| 只读依赖 | SHA-256 |
| --- | --- |
| `packages/schemas/src/market-pit-calendar-structure-v1.ts` | `52485af5389883db5cebc934023f6fd8205c466a04cbcd3076029b2abc97f49a` |
| `apps/server/src/market/market-pit-calendar-package-projection-v1.ts` | `7337c2f2cb5053bf020218a4347fd86535f7b23a7fe4ed25df7761c7b2534965` |

## 草稿 API 与语义

建议 API 已写入草稿：`bindMarketPitDailyDecisionWindowsV3({ input, content, sourceTimes, calendars })`。输入使用实际 `MarketPitReconstructionInputV3`、`archives-bound` 联合清单、`source-times-bound` 对象以及只含 `calendar-package-verified` 成功分支的数组。成功状态仅为 `decision-windows-bound`，输出复算 `barDecisionBindings[]`，不签发场所、修订原发布或严格资格。

日线标签只读确认：V3 builder 将 `point.timestamp` 写成 `occurredAt`，`dailyBarSessionWindow` 使用其前 10 位交易日标签；草稿沿用该合同，没有导入 Backtest 或引入新的标签算法。精确比较使用 `parseMarketPitEvidenceInstantV1` 与 `compareMarketPitEvidenceInstantsV1`，保留全部小数位。原始决策时钟保留为 Bar `availableAt`。

草稿日历索引仅支持固定 `Asia/Shanghai` UTC+08 日内模型，核对连续日期、时段 UTC 关联、有序和不重叠，以及之后最早开市日的第一时段。跨午夜与其他时区失败关闭；未实现或宣称 DST 支持。合成半日、跨年算法仍待测试，不能扩大首批真实 parser 的 2026 年常规双时段登记范围。

## 实际检查与有效性

| 检查 | 实际结果与限制 |
| --- | --- |
| owned Prettier `--write` | 曾完成三份草稿格式化；最后恢复直接 v2 绑定后没有重新执行最终格式检查 |
| 首次单文件 Vitest `--cache=false` | 34 项，24 通过、10 失败；有效揭示 v2 合同冲突 |
| 诊断单项 Vitest | 1 失败、33 跳过；Schema 明确报告 8 条当地时段错误 |
| 临时绕行版本单文件 Vitest | 34 通过；该版本曾移除历史区后绑定 v1，已按协调者要求撤回，此结果不是最终草稿通过证据 |
| Server `pnpm --filter @thesis-ledger/server typecheck` | 临时绕行版本通过；恢复后未复跑，最终草稿类型状态未确认 |
| owned ESLint，`complexity<=20`、`max-lines-per-function<=220`、零 warnings | 失败：`bindWindows` complexity 26；test 中 `_unused` 变量违反 `no-unused-vars`。未宣称通过，也未继续修复 |

所有 Shell 进程均同步返回结束；没有后台进程、待等待 session、Provider、数据库、在线证据文件、build、全量测试或运行态操作。没有改动部署配置或执行最终准入。

## 接续范围

下一 fresh 任务先修复 Schema 中 UTC 瞬时与当地日期/分钟关系，并使用真实登记 parser 产物核对 v2 生产者/消费者语义；本叶不承担该文件所有权。

后续窗口任务应在修复后重新核对草稿，并补齐周末连假、跨年、合成半日、缺后继/有后继无价格、精确边界、重复引用/摘要和错误作用域的有效测试；收敛 `bindWindows` 复杂度、test lint、未知异常稳定理由和最终格式/类型检查。现有合成成功标记仅是 unit 必要输入，不是真实原文准入。repository、最终原文 gate、preflight、冻结、执行日历一致性、离线重验与真实运行态均留给独立任务。

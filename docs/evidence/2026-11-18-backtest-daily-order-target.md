# T04d.8 日线委托目标双容器验收

2026-11-18，正式快更和目标验收通过。Server 和 Worker 各自读取 29 份冻结快照，每份连续执行两次，完整结果逐份等于预期回执。两个容器的 29 份验证明细相同，分别核对了 141 个编译模块的 SHA-256。T04d.8 和 T04d 已完成。[任务](../archive/tasks/2026-11-15-backtest-trade-plans.md)

## 同步范围

同步前主仓为 `main@1ed418780d19`，工作区按默认 Git 状态统计有 775 条变更；infra 为 `8fdd51b51933`。原 Server 和 Worker 均健康，但平仓交易模块与当前宿主哈希不同，两个容器都缺少原生订单槽位模块。经用户明确授权，正式入口构建当前共享工作区，将 Server、Domain、Schemas、Shared 四个完整产物同步到两个既有容器并重启。其他未提交的后端代码也随产物同步。

在 `thesis-ledger-infra` 执行以下命令，退出码 0。同步后两服务均为 healthy，镜像 ID 均保持 `sha256:145d6f91a4ef7c3eaac801f26c89ac42fa446ccfb24c54ff67c03d8b87f0e4c2`。代码位于容器可写层，重建容器将恢复为镜像内代码。数据库结构和外部卷未变更。

```sh
rtk proxy env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh thesis-ledger
```

## 冻结输入和结果

| 目标样本 | 每个容器的验证 |
| --- | --- |
| 发现、编写、局部修改各 8 份 | 复用 T04d.6b 累计通过的 24 份独立生成回执和冻结快照，完整结果、重复回放和原捕获中文均一致 |
| 原价拆股、分红与跨根费用 | 复用 T04d.5c 快照。校验和 `0c70a1b5d2b84230`，六笔成交，平仓净亏 4,035.36 元，期末净值 996,064.64 元。原价公司行动基准限制使整体结果为 `partial` |
| 拆后价格步长拒单 | 复用 T04d.5c 反例。校验和 `d5894795c899f39a`，保留卖出拒单和持仓，期末净值 999,293.80 元，整体结果为 `unavailable` |
| 默认整笔与两种保护激活 | 按既有整笔用例保存两份独立冻结样本，各有一买一卖且数量相等。按量保护校验和 `7abd3f49f4717108`，全成保护为 `799c0561fa35201c` |
| 旧市价固定止损 | 同一冻结输入按已验收的含费预算运行。完整结果和校验和 `65f24721c5ed479c` 一致。与历史中文相比，两容器都仅增加了旧市价当日有效、整笔成交或拒绝的说明 |

验收器核对当前配置回读、完整结果对象及全部冻结产物。24 份模型输入沿用上轮的真实回执；本轮只有冻结执行。三个 v5 用途均为 `native_schema`、`ready`，既有格式资格为 `passed`。只读查询当前 lmstudio 配置并排除凭证后，与上一轮八批去凭证记录逐项相等。本次验收的真实模型调用、业务数据库写入和真实队列投递均为零。[原生成矩阵](2026-11-18-backtest-whole-order-and-native-recheck.md) · [费用与页面回执](2026-11-18-backtest-daily-order-actions-and-confirmation.md)

## 命令与原始回执

主仓私有回执位于 `var/acceptance/t04d-target-20261118-gIxQ9T/`。其中 `sync.log` 保存正式同步日志，`cases-final.json` 保存 29 个有序输入，`target-final/receipt.json` 保存两个容器的完整验收明细和三用途状态，`preservation.json` 保存只读比较结果。

宿主使用临时 Vitest 入口读取已有费用样本的 Parquet 元数据，保存两份默认整笔样本。首次选择元数据时遗漏产物键中的 runId，两份费用样本准备失败；补齐键后仅重试这两份，通过。临时测试源已移入私有回执目录。

```sh
# 主仓目录。T04D_TARGET_RECEIPTS 指向上述私有目录。
rtk proxy env T04D_TARGET_RECEIPTS="$T04D_TARGET_RECEIPTS" npm_config_registry=https://registry.npmmirror.com pnpm --filter @thesis-ledger/server exec vitest run test/backtest/t04d-target-captures-20261118.test.ts
# 定向重试在同一命令末尾追加 -t action-
rtk proxy node --check scripts/local-runtime/run-backtest-trade-plan-runtime-check.mjs
```

目标命令在 infra 目录运行，末尾按 `cases-final.json` 顺序传递 29 个独立参数，最终退出码 0。应用维护脚本在已登记的正式锁中运行，私有临时目录用后清理。

```sh
rtk proxy node scripts/infra.mjs locked --idle -- node "$APP/scripts/local-runtime/run-backtest-trade-plan-runtime-check.mjs" "$T04D_TARGET_RECEIPTS/target-final" "${cases[@]}"
```

首轮 Server 检查选用了含费预算调整前的旧市价回执，预期校验和为 `ff644ddce019001c`，实际为 `65f24721c5ed479c`。旧回执和含费回执的策略相同，冻结内容哈希同为 `1536c59d7fab4adfde7780e51d646de5afdcc90c1a8faf030cb2894a529913fe`。11 月 16 日的 `backtest-monthly-target-inplace-v5-20261116/receipt.json` 已记录两个容器都得到后一个校验和。最终采用此前独立封存的 `backtest-plan-budget-replay-base-discovery-20261115/fixed-stop.json` 比较完整结果；首次失败保留在 `target/thesis-ledger-failure.json`。两轮之间只更正了这份验收基线。

目标范围为 Server／Worker 的离线执行和只读用途资格。T04d.7 的桌面和移动 Web 页面继续沿用原回执。本次未提交、推送或发布新镜像。

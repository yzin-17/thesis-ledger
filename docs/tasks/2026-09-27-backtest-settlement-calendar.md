# 回测结算日历实施任务

对应规格：[回测结算日历覆盖](../specs/2026-09-27-backtest-settlement-calendar.md)。归属主任务 `M22-followup-calendar`，不缩小主任务范围。

- [x] C6：补齐 DSA 实际 HTTP 日历端点的结算范围支持。原共享 `validate_range` 拒绝 end 晚于 dataAsOf，合成读取器未覆盖该拒绝；日历独立允许最多 104 个自然日的后续计划范围，仍检查实际包覆盖，行情端点不放宽。HTTP 定向回归、目标同步及实际 HTTP 验收完成。
  - 2026-09-27：已实现 `validate_calendar_range` 并只接入日历入口，实际安装包的 HTTP 样本通过：start=2026-05-18、end=2026-06-06、dataAsOf=2026-05-21；超预算请求拒绝且旧行情校验仍拒绝未来 end。日历及 V2 依赖共 24 项通过，关键错误 flake8 通过；本次新增 DSA 修复尚未同步目标。
  - 后续目标验收：`sync-code.sh dsa` 退出 0，日志 `/private/tmp/goal-dsa-calendar-sync-20260927.log`；实际 HTTP 同窗口返回 supported、完整覆盖和 `exchange-calendars-4.13.2`，end=2027-01-01 返回 422。探针 `/private/tmp/probe-settlement-calendar-20260927.py` 通过；只读取日历，未创建业务运行。镜像不变，本次仍为容器可写层同步。

- [x] C0：确认实际缺口。生产计划与请求校验截止 endDate，而执行规则需要后续交易日；完整快照测试已复现构建成功但执行失败。
- [x] C1：确定显式冻结版本/标记接缝，保留旧快照读取语义；补模型窗口交集与结算交易日需求的纯函数。
  - [x] C1-a：`backtest-settlement-calendar.ts` 已按适用 exchange 模型段计算最大买卖结算交易日数；候选自然日范围与实际交易日验证分开，T+0 不扩大。定向 2 项测试通过，覆盖窗口外模型段、周末/长假、未知和不足日历。
  - [x] C1-b：新建完整快照元数据冻结 `settlementCalendarPolicy=settlement-calendar-v1`，创建与离线校验共用请求生成器；缺标记按旧请求合同处理，未知标记拒绝。
- [x] C2：新建快照日历请求应用有界候选范围，冻结返回日历后验证实际交易日数；候选范围全部休市时在 finalized 前拒绝，并确认无已完成快照残留。
- [x] C3：完整快照包含结算策略及对应请求证据，离线重放只消费原证据；已删除拆分映射测试的额外日历 fixture 补丁，生产路径自行请求所需范围并通过双次运行一致性测试。
- [x] C4：执行期末成交、T+0/T+1/T+2、周末/长假、模型分段、截断、旧快照回归；完成类型与相关包验证。
- [x] C5：核对主任务与目标部署需要，记录已执行层级和仍未验证的范围。目标运行时验收继续归主任务 F01/G-Deploy 与 G-Run，未计为通过。

## 当前验证证据

2026-09-27：定向执行 `v3-complete-snapshot.test.ts`、`backtest-settlement-calendar.test.ts`、`backtest-snapshot-v3-dependencies.test.ts`、`v3-split-mapping-snapshot.test.ts`，4 文件 19 项通过；Server `tsc -p tsconfig.json --noEmit` 通过。新增完整快照测试验证删除策略标记、未知版本以及实际后续交易日不足均被拒绝。

基础依赖计划保留 warmup 至运行结束日；冻结策略仅扩展实际日历请求，完整性检查据同一元数据重建请求并校验证据。旧无标记依赖请求及完整快照落盘兼容回归已通过。目标 Docker 尚未更新，不能以本地通过代替部署验收。

扩大回归：`pnpm --filter @thesis-ledger/server exec vitest run test/backtest --exclude '**/*integration*'`，54 文件 279 项通过；本轮 5 个生产文件及 3 个测试文件的 ESLint 通过。该回归包含旧 V2、多市场 exchange、NAV 和 V3 离线执行，但不包含真实 Worker 集成与目标 Docker。

旧合同专项：新增 `v3-legacy-calendar-replay.test.ts`，以无策略标记的旧日历请求生成完整证据，经过实际 Parquet 写入、finalize、新 Store 重放和离线 Builder 重入，完整 manifest 保持一致，读取器调用次数未增加。1 项通过，新增文件 ESLint 和 Server 类型检查通过。该证据是合成旧合同快照，不代表已抽检用户历史快照。

期末成交专项：`v3-research-execution.test.ts` 新增卖出再投资 T+0/T+1/T+2 三组断言，经完整冻结后均在 2026-05-20 期末卖出，零拒单，估值仍为 3 个交易日，重复执行一致；文件共 6 项通过，ESLint 通过。买入结算与多段最大需求由纯函数测试覆盖。

部署范围：本补丁仅 Server 源码与测试，无依赖清单、数据库或系统依赖变化。目标容器存在且运行时，应用更新使用 infra `./scripts/sync-code.sh thesis-ledger` 并要求兼容性预检通过；如工作区其他变更导致预检拒绝，改用 `./scripts/update.sh thesis-ledger`，不放宽门禁。当前未执行该目标更新，仍须完成主任务真实运行态验收。

构建收尾：`pnpm --filter @thesis-ledger/server build` 通过，`git diff --check` 通过。主任务仅关闭本地修复叶子 `M22-followup-calendar`，M22 父项及真实门禁保持开放。

后续部署进展：官方 `sync-code.sh thesis-ledger` 已成功同步 Server/Worker，健康检查和结算日历构建文件摘要一致性通过；详见 [目标运行态记录](evidence/2026-09-27-target-runtime-gates.md)。此前“尚未更新”描述对应本地验证时点；真实来源期末成交验收仍未完成。

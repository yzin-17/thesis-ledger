# 价格方向复核的方法及接口证据

关联：[原 Task 的 T13](../2026-10-18-research-evidence-evolution.md)。T13a/T13b 为本地交付；T13c 的现行实源正向消费保持未完成。

## 固定窗口与资料资格

第 0 日使用收盘严格晚于报告生成时刻的首个交易日，同日午间分段合并到最终计划收盘；第 5/20 个交易日不包含第 0 日。测试覆盖盘中、恰好收盘、收盘后、周末、合成假日及美国夏令时切换。窗口覆盖不足、停牌、缺价、端点未知或资料晚于截止时点时保留未知，不移动窗口或读取当前报价补齐。

生产接缝复用 Market 的当前日历和 V3 日线读取。`selected` 状态不能单独提供经济价格资格，仍检查标的/窗口、来源及证据绑定、日历预期日期、同一明确复权锚点、已核实分红语义、价格完成性及可见时间。未接入现行合格日历的市场直接保留未知。零成交量不能提升为已交易事实，也不把缺失或假设描述为已核实停牌。

## 提交、读取与统计

GET 只读取数据库观察；只有显式 POST 才请求资料。原报告权限在调用来源前及保存前分别检查，提交响应回显原历史范围。网络响应丢失后重试同提交；到期或失败的尝试不能被晚到结果恢复。旧报告仅供人工核对，保持原字段和内容。

统计先按逻辑观察选择截止时点内的最新版本，再按研究重试谱系、标的和窗口去重；不按提交或输入版本计样本。同一报告相同窗口的矛盾方向不任意择优。到期、到期时间未知、可计算、未到期和不适用分别列数，排除原因单列。少于 20 个可计算样本或集合读取不完整时，方向符合比例保持未知；样本充足也只提供描述性比例。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| 方法、材料、身份及统计 | 4 文件 38 项通过；`/tmp/thesis-ledger-t13-unit-1792404856.log` |
| 真实 HTTP / 隔离 PostgreSQL | 7 项接口及 6 项存储通过；`/tmp/thesis-ledger-t14-postgres-1792405923.log` |
| SDK 观察及比较合同 | 19 项通过，其中观察 6 项；`/tmp/thesis-ledger-t14-sdk-1792405515.log` |
| 修改文件复杂度及静态检查 | 通过；`/tmp/thesis-ledger-t14-lint-final-1792406472.log` |
| Server 类型及构建 | 通过；`/tmp/thesis-ledger-t14-server-type-1792405894.log`、`/tmp/thesis-ledger-t14-verified-server-build-1792406609.log` |

HTTP 测试使用实际授权、SDK 合同、ORM、数据库和产物投影；Market 端口为明示合成输入，不是实源资格证据。原报告和 Journal 逐字段保持一致，没有执行模型、自动调度、路由变更或账本写入。真实目标运行态和正向实源消费仍由 T13c/G4a/G4b 验收。

最终联合回归：8 文件 89 项定向及 5 文件 40 项真实 HTTP/隔离 SQL 均通过；日志为 `/tmp/thesis-ledger-final-research-unit-1792408815.log`、`/tmp/thesis-ledger-final-postgres-1792408818.log`。35 份迁移矩阵、实际运行包输入、模块边界及有效 HEAD 基线的文件尺寸 ratchet 同时通过，日志前缀 `/tmp/thesis-ledger-final-`。仍未更新目标数据库或目标服务。

## 证据时钟精度补漏

本轮沿 T13a/T13b 修复 `Date.parse` 截断小数秒造成的时间边界错误。修复前，晚于截止点一纳秒的日历、经济基准或端点价格可能被接受；同一毫秒内的收盘、生成时刻也可能选错第 0 日或提前到期。方法与材料回归先复现 8 个失败，共享合同回归再复现 4 个失败，日志分别为 `/tmp/thesis-ledger-t13-clock-before.log`、`/tmp/thesis-ledger-t13-contract-clock-before.log`。

计算、资料资格、共享合同及 SDK 现复用已有精确证据时钟比较，保留来源时间的小数精度，接受表示同一时刻的明确偏移；非法日期及未知偏移保持失败关闭。命令与查询在边界统一规范化为现有毫秒截止时点，后续资料请求、计算和持久化均使用该时刻；保存的来源证据不做毫秒截断。SDK 不接受仅在毫秒截断后相同的响应截止时点。

真实 HTTP 反例使用 `2026-11-30T16:00:00.000999999+08:00` 提交，规范化截止点为 `2026-11-30T08:00:00.000Z`；端点证据在 `08:00:00.000500000Z` 才可见，因此保存资料不足、收益及方向未知。GET 使用同一规范化时点找回原版本。Market 仍为明示合成端口，实际授权、服务、ORM、隔离 PostgreSQL 及历史投影均使用真实实现。

| 检查 | 本轮结果及日志 |
| --- | --- |
| 方法、材料、身份及统计 | 4 文件 49 项通过；`/tmp/thesis-ledger-t13-clock-after.log` |
| 共享合同全量 | 105 文件 1,220 项通过；`/tmp/thesis-ledger-t13-clock-schemas-full.log` |
| SDK 全量 | 14 文件 99 项通过；`/tmp/thesis-ledger-t13-clock-sdk-full.log` |
| 真实 HTTP / 隔离 PostgreSQL 联合回归 | 5 文件 41 项通过，其中观察接口 8 项、存储 6 项；`/tmp/thesis-ledger-t13-clock-postgres.log` |
| Server 类型及构建 | 通过；`/tmp/thesis-ledger-t13-clock-typecheck.log`、`/tmp/thesis-ledger-t13-clock-server-build.log` |
| 修改文件静态检查、复杂度及函数尺寸 | 通过；`/tmp/thesis-ledger-t13-clock-lint.log` |
| 模块边界、有效 HEAD 文件尺寸基线 | 通过；`/tmp/thesis-ledger-t13-clock-boundaries.log`、`/tmp/thesis-ledger-t13-clock-ratchet.log` |

数据库验证入口为主仓 `scripts/test-ai-provider-postgres.mjs`，从主仓目录传入报告、旧报告、比较、观察存储及观察 HTTP 五个现有测试文件；使用脚本自有隔离数据库，执行现行 35 份 migration，观察升级前后的原报告及 Journal 逐字段相等，结束后清理自有容器。没有目标数据库或服务更新，T13c/G4a/G4b 和模型实验条件保持原状态。

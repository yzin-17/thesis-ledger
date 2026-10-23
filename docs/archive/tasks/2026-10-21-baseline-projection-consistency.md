# 乱序余额观察投影一致性实施任务

关联[规格](../../specs/2026-10-21-baseline-projection-consistency.md)与[账户草稿任务 A5](2026-10-21-account-draft-reconciliation-web.md)。用户已选择优先修复；完成本项后立即接回原对账验收与剩余优先级。

## 实施与验证

- [x] B1 合同与复现：保存专用账户现状，确认经济顺序与真实成交不可推断边界，建立成对规格/任务。
- [x] B2 领域修复：共用 Baseline 余量收缩计划，数量与成本同源，保留冲突和原始事实；收敛超限文件职责。
- [x] B3 定向回归：先观察真实案例回归失败，再验证 AVG/FIFO、部分收缩、后续成交、零值及修订有效性；保留原已知买入冲突断言。
- [x] B4 本地门禁：定向通过后执行包级类型/构建、依赖边界及复杂度，记录输入和统计。
- [x] B5 目标验收：正式最小更新；仅重建专用账户，真实 Web 验证数量 3、平均成本 8，原数据、路由及零模型调用核对。
- [x] B6 接续：记录证据，返回账户草稿 A5 完成对账和结清停用；更新任务首页及前沿。

## 当前证据

修复前专用账户 `d1136209-9409-447e-98c8-02fe9743a088`，账本修订 6；`600000.SH` 投影为 9 份、总成本 24，Trade 为 `CONFLICTED`。原始观察事实为 10 月 19 日 3、20 日 9、21 日两次 3，平均成本均为 8。原始失败证据在 `.recovery-artifacts/remaining-p1-2026-10-20/account-draft-completed-probe.json`，保留其当时未通过结果。

新增回归初次得到 8 失败、4 通过，明确复现混合余量；修复后领域全量 `pnpm --dir packages/domain test` 为 50 文件、455 项通过（新增 14 项）。服务端定向 `core-baseline-consistency`、`core-projection`、`baseline-reconciliation`、`baseline-import.service`、`trade-realized-pnl` 为 5 文件、43 项通过。Domain 构建、Server 类型与构建、边界及工作区依赖通过；新模块定向 ESLint 零警告。仓库门禁初次因提取测试夹具后遗留未使用 import 失败，修正后复跑，未据此提前部署。

最终 `pnpm guardrails:complexity` 为 8 组、2301 个文件通过；原有 8 个文件尺寸告警保留，领域告警由 36 降至 35。`trade-projection.ts` 从 905 行减至 880 行，`trade-costs.ts` 从 622 行减至 542 行，没有提高阈值或新增豁免。运行时依赖、Schema/migration、DSA requirements 和 Dockerfile 均未改动，使用正式 `sync-code.sh thesis-ledger`，不把可写层同步当作镜像发布证据。

更新前核对原 14 账户完整保护哈希仍为 `6bec06eac33dfaa1a51b5f18f605bf16ccd377cd5ff27c5f930a55f6e9fc5d80`，五项模型计数均为 0；专用账本仍为修订 6、6 个事件，未提前清理或改写事实。证据：`.recovery-artifacts/remaining-p1-2026-10-20/baseline-consistency-before.json`。

正式脚本已成功同步 Server/Worker 并健康，镜像仍为 `sha256:1562291459dea8079e7a3edf53ece29a9cfd7e14f38c7afad11546e314bae880`。仅对专用账户执行正常重建 API，两次结果相等、修订和 6 个事实均不变；独立估值及 Trade 读取确认数量 3、平均成本 8，并保留 `CONFLICTED` 和原问题代码。真实 Web 已显示 `600000.SH · 3 股 · ¥8.00`，截图保存为 `.recovery-artifacts/remaining-p1-2026-10-20/baseline-consistency-web.jpg`。只读复核完整原数据哈希保持；政策/DSA 164、16 路由、27 来源公共配置指纹及五项模型计数均未改变。初次来源复核脚本漏解包 `providers` 响应，修正为只读复核，没有重发重建；完整结果在 `baseline-consistency-fixed.json`。现已返回原草稿任务 A5，不据此结束总目标。

A5 后续已完成真实对账确认、幂等、撤回及专用账户结清停用；原 14 账户、13 张业务表、57 个 V3 结果与三份草稿修订完全保持。[完整验收及清理](../../tasks/evidence/2026-10-21-account-draft-reconciliation-acceptance.md)保留所有分层证据。补充任务完成归档，原父项与剩余外部条件继续由原清单持有。

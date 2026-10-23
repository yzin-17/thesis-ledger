# 基金实源正式校准与 Web 日级验收预案

对应 [Snapshot Task R3.I8](../2026-08-28-portfolio-snapshot-system.md) 与 [Spec 的基金定价及自有验收约束](../../specs/2026-08-28-portfolio-snapshot-system.md#3-冻结-payload-与证据)。本记录只完成准备阶段，不代表目标校准或 Web 正向验收已通过。

## 当前结论

2026-10-21 用户已明确授权本次及后续所有验收，要求不再逐项确认。执行仍保留数据、Web 范围、真实模型暂停及 DG3 TODO；以下待授权措辞保留为准备时的历史状态，当前直接按受控预案推进，不再请求相同授权。

- I8a 准备完成：维护入口默认只读，19 项定向测试、语法、格式、模块边界和文件尺寸检查通过。
- I8b/I8c 仍未执行。当前没有基金账户，也没有已确认的基金 Asset，不能复用历史已不存在的账户或绕过普通记账准入。
- 先前批准的是单次基金 NAV 接口临时路由验收，已完成并恢复。本次新增账户、Ledger、Snapshot 及现有资产确认需要独立明确授权。
- 原 8 个账户及其事实不接管；真实模型继续暂停，DG3 继续原 TODO，只验 Web。

## 精确预案与允许差集

只读预案为 `.recovery-artifacts/fund-calibration-20261021-plan-v2.json`，SHA-256 为 `0e04b8bcfdff23d80be4ac4075b822aafac787a7762fd5cdebd4bf95088a928f`。案例 ID 为 `01e1f3f0-a529-40ca-bd7f-2ddb5e44a42d`，维护代码输入摘要一并登记。代码或目标基线变化时拒绝执行，须重新只读准备。

1. 仅给政策 156 追加 `FUND_NAV`、`FUND_NAV_HISTORY` 两条 `CN/MUTUAL_FUND` 到 `efinance/eastmoney` 的绑定。临时修订 157，完成或失败恢复原 16 条选择，正常恢复修订为 158。启用状态、来源配置、凭证和其他绑定不改；政策修订与缓存代际正常递增。
2. 首次读取 `161725.OF` 最新 NAV。必须为有限正值、`delayed`、没有回退且此次来源请求没有由 Server 缓存替代；失败立即恢复路由，不创建账户或确认资产。逻辑估值日取该次 NAV 的净值日，不能用主机当天补造未来日点位。
3. 经批准后，仅通过正常确认接口确认现有 `161725.OF`，精确目录 ID 为 `8eaac79d-08bb-49fc-ba16-380b16f0b5d2`，`MUTUAL_FUND/OF/161725`。该 Asset 的 `identityStatus/identitySource/updatedAt` 及对应 `InstrumentAssetAssociation` 确认元数据会持久变化；其他 Asset 字段和目录项保持。保留这次真实确认，不倒改为未确认身份。
4. 新建唯一账户 `基金正式校准验收-20261021-01e1f3f0`，`fund/actual/CNY`。通过正常 Ledger 入口登记入金 1,000、买入 100 份×1.25，成交资格保留 `UNVERIFIED`、费用为空。该事实只作专用验收记账，不涉及证券委托或银行转移。
5. 用真实 Server 基金接口与实际编译的估值服务，给此账户新增一个估算槽位。冻结输入应为 100 份、成本 125、现金 875。
6. 通过正常 Ledger 卖出同样 100 份×1.25，取回 1,000 记账现金，核对份额和现金均为零，再用正式停用接口停用。仅校准自有槽位，正式修订仍须使用冻结输入，追加修订 2，并以相同证据重复校准验证复用同一 ID、原估算不变。
7. 最多预留 4 次 Server 基金数据 GET：最新 NAV 预检一次、估算当前 NAV 一次、该净值日历史 NAV 一次、同日重复校准一次。历史范围只含该日、`limit=1`；不读披露或穿透持仓。后续相同有效证据可来自正常缓存，缓存或 DSA 内部 SDK 尝试数不能与这 4 次 HTTP 预算混称。该日 `FundNavPoint` 与正常缓存允许按事实更新；其他基金数据摘要保持。
8. 路由恢复并核对保护后，仅为 Web 选择临时重新启用本次已结清账户，读取自有日级点与正式值，核对原估算/版本链，恢复原账户模式等偏好，再收尾停用。保留新账户、4 条自有 Ledger 事件、全部新审计和估算/正式修订，不删除历史。

## 保护与失败恢复

- 11 张原业务表及 `ProviderConfig/AiRoutingSettings` 共 13 张表逐表比较摘要，仅允许按精确 UUID 排除本次新账户关联行；其他 Asset、关联、基金净值和全部 Instrument 分别保护。
- 57 份原 V3 回测结果 ID/校验、结构 head、五个目标容器身份/镜像、原运行开关、研究执行/工具/观察/版本/提交/调用计数保持。所有来源的启用、配置版本、凭证配置状态在前后比较。
- 账户必须同时匹配案例 UUID、唯一名称、`fund/actual/CNY`。Ledger 仅允许本次 channel、actor 与四个精确外部 ID；未知余额、额外事实、错误所有权停止清理。不存在永久删除、批量修复、真实模型调用或任意来源写入口。
- 命令输入先落私有回执，提交回执丢失时按实际自有余额处理。来源校验失败保存有限原值，不为补证重复来源请求。运行态阶段失败保留有限来源回执。
- 成功和异常均独立尝试结清自有账户及恢复精确路由；并行政策变化拒绝覆盖。未完成清理、保护或 Web 验证时不能输出通过，原 Task 保持未勾选。

## 可审查入口与验证

- `scripts/fund-calibration-acceptance.mjs`：默认只读计划、精确授权参数、私有原子回执、恢复及 Web 收尾。
- `scripts/fund-calibration-case.mjs` 与 `scripts/fund-calibration-guards.mjs`：案例状态流、正常记账、所有权与允许差集。
- `scripts/fund-calibration-target.mjs` 与 `scripts/fund-calibration-runtime.cjs`：固定目标与接口白名单、只读保护快照、受限实际业务服务。
- `node --test scripts/fund-calibration-case.test.mjs scripts/fund-nav-route-case.test.mjs`：19/19，通过；包括来源失败/零值留证、账户和买入回执丢失、外来记账、失败清理、模型与永久删除请求拒绝、范围扩大拒绝、原数据/模型计数保护、并行政策保护。
- `node --check scripts/fund-calibration-runtime.cjs` 与相关模块导入、Prettier 检查通过。现有 ESLint 配置忽略这些维护脚本，因此不把其零错误退出作为脚本 lint 覆盖证据。
- `node scripts/check-boundaries.mjs`、`node scripts/check-file-size-guardrails.mjs` 通过；尺寸门禁保留原有 8 项警告。此阶段仅新增维护脚本，不重复构建或更新目标镜像。

授权后执行以下维护入口；当前尚未执行：

```sh
node scripts/fund-calibration-acceptance.mjs \
  --execute .recovery-artifacts/fund-calibration-20261021-plan-v2.json \
  --authorized-owned-fund-calibration
```

回执写入 `.recovery-artifacts/fund-calibration-20261021-01e1f3f0/recovery.json`。失败用 `--recover <recovery.json> --authorized-owned-fund-calibration`；完成真实 Web 取证后用 `--finish <recovery.json> --web-evidence <web-evidence.json> --authorized-owned-fund-calibration` 收尾。恢复和收尾不重新发起市场数据读取。

基金披露、分钟穿透、其他市场日历及研究经济价格资格继续各按原验收条件保留；本次成功也只关闭 I8 对应叶，不整体关闭 R3 或其他父任务。

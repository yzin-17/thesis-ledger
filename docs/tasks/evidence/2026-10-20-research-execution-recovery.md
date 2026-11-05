# 研究 G2b 受控执行恢复验收

日期：2026-10-20（亚洲/上海）。所属：[研究 Task 的 G2b](../2026-10-18-research-evidence-evolution.md)。本轮接续已通过的 [G2a/G2b-A 双读与实际基线恢复](2026-10-20-research-dual-read.md)。

## 执行边界

复用目标实际 Server 镜像 `sha256:c1f3c9d890e17f6ffa827aae9c80a8b21fd53e4d37d08ed4a51a3f3de8187eac` 及登记的 PostgreSQL/Redis 镜像，不重新构建。基线 Manifest SHA-256 为 `365c42b6e52768e4b5b40e7f0477ccb3f22409e58133e0c05aab423913134d07`，含 10 份保存 Run、9 条 Tool 审计、原 57 份成功策略结果和结构 head `20261019020000_research_observation_versions`。

infra 正式入口先将基线恢复到固定 `restore_db`，保留原有业务数据，再在同一候选镜像中运行实际编译的 `AiRunService`、`AiExecutionStateStore`、`AiResearchExecutor`、Registry、SDK 适配器和 Prisma。每个执行/恢复动作由独立 Node 进程完成；领取、发送、取消和结算使用实际生产实现，没有替换数据库返回或 SDK 传输结果。

仅受控范围授权回答和上游材料/模型响应使用夹具。模型为同一隔离网络命名空间内的本地 SSE 服务，使用无鉴权的固定受控 Provider/Model；Docker 网络为 `none`，没有宿主挂载、持久卷或对外端口。进程只允许 `127.0.0.1:5432/restore_db` 的 `restore_owner`，拒绝生产库身份、远端、URL 附加选项和非本机模型原点。

V2 提交开关只在夹具子进程内开启。用于 HTTP 读取的实际 Server 仍使用只读账号，创建能力关闭；目标服务、原凭证、默认引用、路由及暂停状态保持原样。合成费用用于检查结算一致性，不代表真实模型支出。

## 结果

| 场景 | 真实过程与终态断言 |
| --- | --- |
| queued 重启 | 排队进程被 SIGKILL，后继进程领取并成功；1 次请求、1 次结算 |
| prepared 重启 | 预留进程被 SIGKILL，新代次复用原请求身份；attempt=2，原冻结材料不变，旧 attempt 提交拒绝 |
| 发送中重启 | 实际 SDK POST 到达本地 SSE 后 SIGKILL，租约实际过期；终态 `research_unknown_outcome`，后继执行不重发、不结算 |
| 租约丢失与晚到结果 | 存活执行进程等待 SSE 时注入租约丢失，另一进程恢复；释放有效响应后终态、保存结果及执行审计均不被晚到结果覆盖 |
| queued 取消 | 重复取消结果一致，后继执行不领取；0 次模型请求 |
| prepared 取消 | 保留单次预留及 `externalResult=not_sent`，没有发送或结算 |
| 发送后取消及晚到结果 | 实际请求到达后取消；晚到有效响应不改变取消终态或执行审计 |
| 同进程中止传输 | 保存取消后通知执行进程调用实际 `cancelActive`，SDK 传输中止并收敛，不接受结果 |
| 重复结算 | 正常成功后两次重复提交相同计量修订，均为幂等未应用，费用及使用量不增加 |

9 个场景全部通过；共 22 个独立进程，其中 4 个实际 SIGKILL，剩余子进程为 0。7 次真实本地 SDK 请求，真实模型请求为 0。数据库读取的合成总计量为 input=24、output=15、USD 0.21，只有 3 次已结算请求，其余失败/取消均没有接受用量或费用。

崩溃恢复保留请求最后持久化的 `dispatching` 状态；业务 Run 为 `failed/research_unknown_outcome`、用量为 `unknown`、结算修订为 0。这按既有恢复合同表达未知外部结果，不把没有收到的响应改造成成功或已确认未发送。取消路径另外保留其实际 `prepared/unknown` 审计。

实际 Server 的公开 SDK 又执行 13 次 HTTP 读取：9 份新终态与 3 份成功报告冻结引用均可读，创建能力仍关闭。成功读取验证与执行状态断言独立，使用的 156 份有效 Schema 和公开 SDK 与 G2a 登记输入一致。

## 数据保留与可复核入口

```sh
cd /Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra
node scripts/research-target-recovery.mjs --target thesis-ledger-dev \
  --baseline "$PWD/.maintenance-backups/g2a-baseline-20261020-1" \
  --output "$PWD/.maintenance-backups/g2b-execution-20261020-2"
```

私有原始证据为上述目录的 `report.json`、`probe.json`、`probe.log` 与 `runtime/` 回执；仅展示脱敏汇总，业务原始数据继续留在忽略目录。脚本输入、基线、镜像身份与实际请求/进程/状态统计均已封存。

本次成功报告的脚本输入 SHA-256 为 `302675c57013e63a14d74c04f49c888e851c155836f84d7490910203b82b2029`；后续没有修改这些执行矩阵输入。

恢复副本只改变 `AiRoutingSettings`、`AiRun`、`AiToolCall` 三张 AI 所有的表。原有 10 份保存报告和 9 条 Tool 审计逐表排除新增受控 ID 后指纹一致；其他表逐表核对，7 张业务保护表和 57 份原策略结果保持一致。目标容器、保护数据、任务与调用事实前后分别一致，未新增目标模型调用。

主仓驱动边界 2 项、infra 正式入口 2 项定向测试通过；实际进程矩阵通过后，隔离资源由维护入口清理，无存活夹具子进程。没有改应用执行语义、依赖、Schema 或目标镜像，不重复构建或重跑输入未变的旧 R1。

G2b 在本 Spec 的受控执行与恢复兼容范围通过。既有 AI Task 的真实目标在途/真实 Provider 条件仍按原暂停决定保留；研究 G3 与 DSA DG3 的新闻/获准模型条件保持未完成。

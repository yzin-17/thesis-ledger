# 研究 G2a 双版本读取验收

日期：2026-10-20（亚洲/上海）。所属：[研究 Task 的 G2a](../2026-10-18-research-evidence-evolution.md)。目标升级启动沿用 [G2a-B 回执](2026-10-19-research-capabilities-runtime.md)，本回执补齐保存产物正向读取。

## 输入与边界

- Server 为目标实际镜像 `sha256:c1f3c9d890e17f6ffa827aae9c80a8b21fd53e4d37d08ed4a51a3f3de8187eac`；没有重新构建或替换目标服务。
- PostgreSQL 镜像为 `sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`。结构 head 为 `20261019020000_research_observation_versions`。
- 正式备份为 infra 私有目录 `.maintenance-backups/dg2a-20261019-1`。全部载荷及权限重新校验；PostgreSQL dump SHA-256 为 `f2766c51619f97f888b1c309b27c3327e5591b9243183b6b004d5ca5c683990f`。备份的 7 张保护表和 57 份成功 V3 结果与目标、恢复副本分别核对。
- 目标原有 `AiRun=0`，没有历史研究/Journal AI 正向记录。保存样本只写隔离副本，明确标记为受控材料；不把样本认作真实来源、模型执行或已有用户报告。
- 副本 PostgreSQL 使用 `--network none`，Server/Redis 共享其网络命名空间。没有外网、宿主业务挂载、持久卷或发布端口；数据使用临时内存挂载。资源仅由有所有权校验的 infra 正式脚本创建和清理。
- 实际编译 Server 使用只读账号 `research_reader`：全部业务表的 INSERT/UPDATE/DELETE 权限数量为 0，默认事务只读。`NODE_ENV=test` 明确关闭后台调度；研究执行、V2 写入和策略优化开关均为 `false`。这是同一产物的受控读取验证，不能替代生产启动、生成或恢复场景。

## C1/C2：实际 HTTP 与 SDK

执行入口：

```sh
cd /Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra
node scripts/research-dual-read.mjs run --target thesis-ledger-dev \
  --backup "$PWD/.maintenance-backups/dg2a-20261019-1" \
  --output "$PWD/.maintenance-backups/g2a-dual-read-20261020-8" --retain
```

结果：20 次真实 HTTP 请求、33 项断言通过。宿主公开 `ThesisLedgerApiClient` 消费原始状态与响应字节；桥只允许登记的 GET，不替换 DTO 或响应。156 份有源码的共享 Schema 编译文件与镜像逐字节一致；宿主另有 6 份无源码、无有效模块引用的旧编译输出，未作为有效输入，也未删除现有文件。

| 场景 | 实测结果 |
| --- | --- |
| V1 有所属 Tool 审计 | 原文与版本 1 可读，历史范围保持未记录 |
| V1 缺所属审计 | 保持 `pending_verification` |
| 实际/模拟 V2 | 两份正向报告分别可读，封存身份、数值声明和审计关联有效 |
| 冻结引用 | 返回保存的原材料、来源字段及指纹，价格为受控值 100 CNY |
| 篡改材料、借用其他 Run 的 Tool | 结果为 `invalid`，正文及引用不可用 |
| 跨模式、历史/当前入口、其他对象及其他引用 | 7 项越界或损坏读取拒绝 |
| 创建能力 | `canCreate=false` |

读取前后，副本任务/Tool/调用事实数量及保护表一致；目标容器身份、镜像、保护数据及任务/调用数量一致，新增模型调用为 0。Server 镜像未运行 DSA 获取或模型执行。

输入指纹：

- Schema：`b0784be96f4948558a5b36b9fdad936378ec7ad9b390556e6e84c32d6f1fcf0b`。
- SDK（11 份编译 JS）：`f471586115fec91adc9dfb568a18fff3ddf1f5e2c35c280e980499e147c04775`。
- 保存样本输入：`8049643686fa2f47c4f712493d73998deec24bb4b2dd99a708ae8a065bd59524`。
- 私有原始回执：infra `.maintenance-backups/g2a-dual-read-20261020-8/report.json`；包括镜像、脚本指纹和精确统计。所有业务标识与原始备份继续留在私有忽略目录。

## C3：浏览器与其他消费者

现有 Desktop 前端经独立 Vite 实例运行于 `127.0.0.1:5183`，代理到只读桥；没有修改用户现有客户端配置。浏览器使用真实服务响应，完成以下检查：

1. 实际 V2 完整阅读、100 CNY 数值及冻结来源展开可读。
2. 全局切换模拟后原实际正文清除；模拟列表只含所属记录，模拟 V2 正文可读。
3. 损坏 V2 显示“结果不可用”，隐藏正文和引用。
4. 历史入口独立显示 V1，并明确“历史范围未记录”；不随当前模拟模式重新归类。
5. V1 原文保留，历史引用展开后确认“已核对属于该研究的读取记录”。

截图保留于 infra 私有目录 `.maintenance-backups/g2a-dual-read-20261020-7/` 的 `browser-v2-actual.png`、`browser-v2-shadow.png`、`browser-v2-invalid.png`、`browser-v1-legacy.png`。该副本与上述通过副本使用同一镜像、Schema、SDK 和保存样本输入。

只读桥未暴露外围健康/配置接口，页面的服务检查提示失败属于夹具边界，不能据此声明隔离环境整体健康。本次客户端范围按用户决定为 Web；T0 的 Mobile 无直接消费者结论只作源码清单记录。

Journal 与既有策略结果通过同一实际镜像的公开 SDK 独立验收，私有回执位于 infra `.maintenance-backups/g2a-dual-read-20261020-8/consumers-retry1/report.json`：

- 单对象、周期复盘各 1 份保存 V1 正向读取通过；各自带 V2 结果的反例均返回 `result=null`，未进入复盘 V1 结果合同。
- 4 项跨模式读取返回 404；4 份复盘 Run 均不进入通用研究历史。
- 57 份既有成功 V3 策略结果逐份经真实 GET、公开 SDK 合同及恢复库保存正文核对通过；没有重新执行回测。
- 合计 68 次请求、123 项断言。包含 2 次真实 429，读桥保留 `Retry-After`，客户端按服务端给定的 57 秒等待后继续；没有修改或绕过限流。
- 原有 6 个实际账户均停用，首次绑定原账户的样本被访问层正确拒绝。正式正向样本在副本另增 1 个固定身份的受控账户；原账户未启用、未修改。创建样本后，排除这条明确的新记录重新计算的 7 张原有保护表指纹与原备份一致。
- 副本合计新增 4 份受控复盘 Run/4 条 Tool 审计。真实目标仍为 `AiRun=0`；原有数据和任务/调用事实保持一致，模型调用增量为 0。
- 消费者输入 SHA-256：`7212e7c2affcd15690ac406ca9f57996afcd06e3d21bf8bb296b17a4d63595cf`。再次复用现存样本读取前，脚本逐字段验证保存的受控账户、Run 和审计；复用模式不重建或改写样本。

G2a 的目标保留升级、双读和本次 Web 消费者断言已齐备，父门禁关闭。全量目标升级、源 Provider 资格、真实模型和执行故障恢复仍按各自门禁判断。

## 双读基线与 G2b-A 实际恢复

正式封存入口为 infra `scripts/research-dual-read-seal.mjs`。私有基线位于 `.maintenance-backups/g2a-baseline-20261020-1/`，全部文件权限为 600，目录为 700：

| 载荷 | 大小 | SHA-256 |
| --- | ---: | --- |
| `postgres.dump` | 3,867,383 字节 | `4abed616d74e12fc765df29799d1839539aa4fdeabb6113952af82a72e0769d7` |
| `research-fixtures.json` | 67,224 字节 | `a6d1be83d49c70854fb1e82428e6dc8b7d1a6a0a5e6364d1f37250d8cd5dda63` |
| `journal-fixtures.json` | 69,907 字节 | `77e80f660a5e796690a6eb742f1ba842ba26a885f6953cb3251906e5a12cae2a` |

Manifest 格式为 `research-dual-read-baseline-v1`，明确固定 `restore_db`、镜像、结构、受控账户身份、保存数量及保护状态；不是目标生产库的替换指令。Manifest SHA-256 为 `365c42b6e52768e4b5b40e7f0477ccb3f22409e58133e0c05aab423913134d07`。

实际恢复命令：

```sh
cd /Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra
node scripts/research-dual-read.mjs run --target thesis-ledger-dev \
  --baseline "$PWD/.maintenance-backups/g2a-baseline-20261020-1" \
  --output "$PWD/.maintenance-backups/g2b-baseline-restore-20261020-1"
```

该命令重新校验全部载荷，在新的固定隔离库完整执行 `pg_restore`，不补造或重新封存结果。恢复的 10 份 Run/9 条 Tool 审计、7 张保护表、57 份成功策略结果及结构 head 与登记基线一致。使用登记的同一镜像重新启动实际 Server 和只读账号：研究 HTTP/SDK 20 次请求、33 项断言，Journal 9 次请求、9 项断言全部通过；读取前后副本和目标状态分别保持一致。57 份策略结果在本步骤核对恢复指纹，逐份 SDK 正向读取复用上节证据。

G2b-A 的保存产物恢复兼容已通过。后继 [G2b 执行回执](2026-10-20-research-execution-recovery.md)已补齐 B0/B1 的进程重启、租约丢失、取消、晚到结果与结算 9 场景；本节只承接保存产物恢复。既有 AI Task 的真实目标在途/Provider 条件继续暂停，不由受控副本替代。

## 定向验证与接续

- 主仓保存产物夹具：3 项 Node 测试通过，直接核验实际封存、数值、身份及损坏反例。
- Journal 保存夹具：1 项 Node 测试通过，单对象及周期冻结 V1 合同有效，复盘严格结果合同拒绝 V2。
- infra 资源/SQL/读桥/基线边界：5 项 Node 测试通过，涵盖错误资源、外网、宿主挂载/卷、写路径、受控账户身份及篡改/越界载荷拒绝。
- 当前只增加验收入口与文档；共享运行时源码、依赖、数据库结构、目标镜像均未改动。不重复运行输入未变化的包构建、仓库全量测试或 DSA 已通过门禁。
- DG3 按用户决定继续保留原 Task 的 TODO；真实模型保持暂停。G2a 与 G2b-A 已完成，接续 G2b-B0/B1；G3 仍保留新闻与获准模型条件。

## 退出核对

本轮隔离数据库、Redis、Server、夹具容器均已由登记的维护入口清理，带本轮资源标签的剩余容器为 0。独立读桥、Vite 及临时验收窗口已结束；正式备份、双读基线、截图和私有回执保留。

最终只读核对：目标 5 项服务健康，7 张保护表及 57 份原成功结果与进入本轮前一致；`AiRun`、`AiToolCall`、`ResearchObservation`、`AiInvocation`、`AiInvocationFact` 均为 0。正式原备份与双读基线的全部载荷再次校验通过。三仓 HEAD 未变化、暂存区为空，本轮没有提交或推送。

# 研究创建资格接口运行态修复

日期：2026-10-19。用户授权排查并修复创建资格接口，明确禁止真实 AI 调用。本回执归属[研究增强任务 G2a](../2026-10-18-research-evidence-evolution.md)，不替代 G2a/G2b/G3 的完整验收。

## 根因与修复

1. 前端通过现行 SDK 请求 `GET /api/v1/research/capabilities`；目标返回 404 `Cannot GET`，同时新版报告列表也为 404。源码已注册 `ResearchModule/ResearchController`，运行容器产物却没有对应控制器或模块注册。健康检查显示结构 head 为 `20261006030000_strategy_authoring_save`，源码另有两项 10-19 migration。因此根因是新版前端配对旧后端运行产物，不是创建资格业务拒绝或 SDK 地址错误。
2. 首次正式更新在数据库变更前失败：镜像中 `nest build` 达到默认约 2 GiB Node 堆上限，出现 `JavaScript heap out of memory`。原 Server/Worker 保持健康、目标数据库未升级。
3. `infra/docker/server.Dockerfile` 只给 workspace 编译命令设置 `NODE_OPTIONS=--max-old-space-size=4096`。Docker daemon 内存约 5.78 GiB，原服务约占 1.3 GiB；使用既有缓存从同一正式入口重新构建成功。运行容器 `NODE_OPTIONS` 仍未设置，不改变运行时堆参数或质量门禁。

## 正式更新与保留数据

执行目录：`thesis-ledger-infra`。两次均使用正式入口：

```sh
DEV_DATABASE_MODE=upgrade \
DEV_DATABASE_CONFIRM=thesis-ledger-dev/thesis_ledger \
AI_RESEARCH_EXECUTION_ENABLED=false \
./scripts/update.sh thesis-ledger
```

首次退出 1，修复编译预算后第二次退出 0。没有使用开发重建、手工替换容器、直接 Compose 构建或删除数据卷。正式脚本启动目标时也处理了其 Compose 依赖；DSA、PostgreSQL、Redis 与两个 ThesisLedger 消费者最终均健康。

- 已核对实际目标数据库和 owner 均为 `thesis_ledger`，Compose 项目为 `thesis-ledger-dev`。
- 正式入口在停止 Server/Worker 后，生成备份、恢复到隔离副本、执行同一升级 SQL，并通过结构、应用角色权限及原数据保留校验，随后才对目标执行事务。
- 备份与受保护证据目录：`thesis-ledger-infra/.database-upgrades/run.lS27aP/`；备份为 3,848,790 字节，SHA256 为 `4670e9039365ba82e9232febdf50fd8750a9b4618d999ba7514b34d8f0b0b971`。
- `rehearsal.json` 的 `structureComplete/appRolePermissions/preservedData` 均为 true；`execute.log` 为“事务执行成功”。目标结构门禁通过。
- 结构 head 更新为 `20261019020000_research_observation_versions`；新镜像为 `sha256:32f806b35a670c82de37a8db40e2972569411a5c27e5afd6d9d992121a818acd`。本次是完整镜像更新，不是容器可写层快更。

## 验证结果与零调用边界

- 定向 `vitest`：研究提交、V2 执行策略、升级计划、演练、SQL 与归档映射共 6 文件、50 项通过。部署编译由正式镜像构建通过。
- 公开 GET 与实际 SDK：资格接口均成功读取 `research-capabilities-v2`，返回 `canCreate: false` 及五类允许范围。
- 实际 SDK 的实际模式、模拟模式及旧报告列表读取均成功，当前为空；没有把空页当成旧 V1/受控 V2 正向报告读取证据。
- `/api/v1/health` 为 healthy，数据库、Redis、DSA 均 healthy，Server 与 Worker 均健康；新 Server 启动日志登记该 GET 路由，无启动错误或缺表日志。
- 研究执行开关仍为 false，V2 写入开关仍未设置、按默认关闭。策略优化开关保留原值 true，没有提交优化请求。
- 更新前后 `AiRun/OptimizationAttempt/AiInvocation/AiInvocationFact` 数量均为 0；没有提交研究、保存模型配置、测试连接或调用真实 AI。
- IAB 通过本机 Vite 代理核对：研究列表正常空态；新建研究完整显示模型与五范围字段，错误“创建资格暂时无法读取”消失，改为准确的“当前尚未开放研究创建”；提交保持禁用。浏览器仅打开与关闭表单，没有选择对象、保存或提交。

原始更新日志：`/tmp/research-capabilities-update-20261019.log` 与 `/tmp/research-capabilities-update-20261019-build-memory.log`。没有修改默认模型、凭证、来源准入或 AI 预算，没有提交或推送代码。

## 完成边界

本次只读接口恢复及 G2a-B 构建修复已完成。G2a 的完整历史/双版本正向读取与其余消费者、G2b 恢复/回退和 G3 真实来源/获准模型验收继续由原任务维护，未勾选完成。原本停止的真实 AI 生成未被恢复。

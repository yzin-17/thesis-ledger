# AI 实验原地失败重试验收

## 范围与实现

用户要求在原实验直接失败重试。按[规格](../../specs/2026-11-12-experiment-manual-retry.md)实现，结案状态由[任务](../tasks/2026-11-12-experiment-manual-retry.md)维护。

`OptimizationExperiment.retryState` 保存追加的人工恢复记录、原失败原因、旧执行 attempt、明确允许的历史未知请求与新轮次起点。新接口为 `POST /strategy-optimization/experiments/:id/retry`，绑定幂等键和预期 attempt。受理事务锁定原行，保留配置、基线、候选、尝试和累计消耗；累计预算不足拒绝。已过期的模型请求先收敛为未知结果；仍在租约内或缺少可靠停止事实时拒绝并保留原因。

执行继续沿用原实验 ID。重新生成使用追加轮次，已完成基线复用；后续自动封存测试和统一揭示沿用已有合同。普通恢复仍阻断新未知结果，人工受理不成为无限重试开关。阶段、基线、候选评估、预算和失败提交新增或保留执行 attempt 条件。原队列恢复器每 15 秒接续持久化排队事实，可覆盖受理后进程退出或原执行尚在收尾的间隙。

Desktop 详情与旧结果入口共用 `ExperimentFailureNotice`；Mobile 使用相同接口并保留操作回执，丢失响应后找回同一幂等请求。按钮直接表达“失败重试”，可见说明保留历史和累计用量并重新请求模型；请求中禁用并显示加载状态，失败保留原页。

## 本地与隔离证据

- 新隔离 PostgreSQL 重试测试 5 项通过：同请求并发受理一次、旧原因与用量保留、历史未知结果明确恢复、新未知继续阻断、原身份从新轮次自动完成、预算与时长拒绝、过期请求收敛、活动/取消/成功/锁定拒绝，以及旧 attempt 不能改写新状态或预留预算。
- 同次隔离初始化完整执行 51 项 migration；原 T06 封存恢复、并发与揭示测试 7 项通过。后续只重跑受代码变化影响的重试文件，旧 T06 的独立输入不变。
- 最终 Server 实验目录回归 37 个文件、177 项通过；15 个文件、60 项按环境配置跳过，跳过不计通过，其中重试与 T06 的隔离结果单列记录。
- Schemas 新合同 2 项、API client 10 项、Mobile 回执 4 项通过。请求不能注入预算重置或配置修改；响应必须匹配原实验身份。
- 针对公共读取字段可能影响旧消费者的额外核验：Schemas 全包 143 个文件、1567 项通过，API client 全包 45 个文件、236 项通过，包含前述定向用例，不重复计数。
- 数据库结构测试 11 项、迁移矩阵和运行时打包输入检查通过：51 项 migration、105 张预期表、85 个 Prisma model、20 张 raw-owned 表，head 为 `20261112020000_optimization_manual_retry`。新迁移仅新增对象列及约束，无历史数据重写。
- Server 五包构建、Desktop 构建、Mobile TypeScript、定向 ESLint、import 边界与尺寸门禁最终复验通过。尺寸门禁保留五项既有告警，没有增加新的超限文件。Mobile 原生配置和依赖未变，本次不声称原生设备验收。

初轮检查暴露 Mobile 对可选字段的严格类型不匹配、费用字段未收窄类型，以及结构测试仍固定为第 49 项 head；分别修正类型、费用校验和当前结构预期，没有关闭门禁。浏览器首轮加载图标使按钮可访问名称包含“正在加载”，已将图标设为装饰并保留按钮文字；缺少停止原因的失败记录补充准确的通用文案并验证仍有重试入口。

隔离入口：`RUN_STRATEGY_CENTER_T06_POSTGRES=1 node scripts/test-journal-review-postgres.mjs test/strategy-optimization/strategy-optimization-retry.postgres.integration.test.ts`。测试只操作脚本生成的隔离数据库和受控执行器，没有连接真实模型或来源。日志位于 `/tmp/manual-retry-*.log`，大型日志和可重建产物不入库。

## 浏览器证据

脚本 `apps/desktop/scripts/check-experiment-manual-retry.cjs` 在 1440、1024、768、390 宽度通过：原身份与路径保留、失败反馈与可继续操作、同一意图复用幂等键、请求中禁用、受理后自动轮询到完成、成功/取消不展示重试，以及缺少停止原因的失败仍可重试。没有页面错误或页面横向溢出；全部非读取请求受控拦截，真实业务写入为零。已人工查看桌面和窄屏截图。

结果为 `/tmp/experiment-manual-retry-qa/results.json`；截图为同目录 `failed-{1440,1024,768,390}.png`。真实失败实验的只读页面与正式运行态另行核验，不以此受控结果代替。

## 正式运行态

通过 `DEV_DATABASE_MODE=upgrade DEV_DATABASE_CONFIRM=thesis-ledger-dev/thesis_ledger ./scripts/update.sh thesis-ledger` 的正式保留数据路径完成更新。新列和 raw-owned 输入需要完整更新，没有执行清库或直接改容器。原下载阶段记录保留在 `/tmp/manual-retry-update.log`；成功更新日志为 `/tmp/manual-retry-update-mirror.log`。

更新前实际实验 `91a69058-9dc7-4d12-9cb3-68b38356d54a` 为 `failed / failed`、`executionAttempt=1`，模型调用 1 次、回测 2 次、输入 Token 9061、输出 Token 20000，停止原因为 `model_generation_failed`。后续核对这些事实不变，真实失败实验不提交实际重试，不将本次功能验收扩大为模型连通性验收。

首次正式更新长期停留在 Alpine `gcc` 下载，未进入数据库阶段。只读抽样同一软件包前 64 KiB：原源约 3.48 秒，清华镜像约 0.37 秒；均为 HTTP 206。通过更新程序已有 SIGINT 处理正常退出，退出码 130，Server／Worker 保持健康。随后使用正式入口支持的单次 `BUILD_ALPINE_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/alpine` 重新更新，保留其余精确目标与保留数据参数，日志为 `/tmp/manual-retry-update-mirror.log`。没有修改默认配置、应用模型或行情来源，也没有绕过包签名、结构或备份门禁。

成功更新退出码为 0。目标数据库及 owner 均为 `thesis_ledger`；备份与演练位于 infra 的 `.database-upgrades/run.JDh3jD`，全部证据文件权限为 `0600`。备份 11,822,746 字节，SHA256 为 `d3e4147ca531d74bd0896ce4a4a9710052e62df99c99a04ac0a9a30e199c84c0`，没有加入版本控制。

演练于 `2026-11-12T06:00:08.005Z` 确认恢复源 head `20261112010000_autonomous_model_arena`、升级 head `20261112020000_optimization_manual_retry`、完整结构、应用角色权限及旧数据保留全部通过。实际执行记录为“事务执行成功。”独立 SQL 核对目标 head 一致，新列为 `jsonb / NOT NULL / '{}'::jsonb`。

Server／Worker 均使用镜像 `sha256:8066e62ea225285e281698676d3dfad77a481fa253e24fc235e8e1aa9360764f`，健康检查通过，启动窗口无缺表错误。宿主与两个容器的主服务、重试 helper、候选服务、回测服务、尝试生命周期、新重试 Schema 和公共读取 Schema 共七项编译产物 SHA256 逐项一致。关键摘要：

| 产物 | SHA256 |
| --- | --- |
| 主实验服务 | `4ded7a51871bd299091d8e9995e332334a6b5b161c2c357809a548065c16d089` |
| 重试受理 | `90f61f6a72ecc0ff21f9bdda44f2e121220c421488f464f8f1a46cea195d6555` |
| 候选服务 | `ecc0ef7db63423cfd5cffde44daceacebdc02cd355d2feae9fb865ff82527eed` |
| 重试 Schema | `89719abffc8dfd366bc3d47116058a3ad5e30c3f74756c0dde967d948ce6b4fa` |

实际 `/retry` 空请求返回 HTTP 400，在输入校验阶段拒绝。原失败实验读取仍为 HTTP 200，状态、执行 attempt、调用、回测、输入/输出 Token 与更新前逐项一致，原尝试仍为 `unknown_outcome / AI connection 阶段超时`；新列仅为默认 `{}`，没有受理真实重试。

实际页面在 1440、390 宽只读复核通过，已人工查看截图：停止原因下有可见的“失败重试”，请求携带原实验 ID、`expectedExecutionAttempt=1` 及幂等键。所有非读取请求在浏览器受控拦截，模拟失败后仍保留原页与可重试入口；无页面错误、横向溢出或真实业务写入。结果为 `/tmp/experiment-manual-retry-qa/runtime-results.json`，截图为同目录 `runtime-{1440,390}.png`。实际模型连通性及新的真实模型请求不在此次验收范围内。

## 最终一致性审查

新增按钮和重试接口没有创建副本、删除历史、重置预算、改变已锁定测试或自动采纳策略。旧失败原因存入追加审计，原尝试与候选保留；共享预算和阶段写入按 attempt 拒绝过期执行。当前规格、自动完成合同、使用指南和迁移矩阵已同步，相关文档链接与 `git diff --check` 通过。T1—T5 范围完成，任务及专属证据归档，当前行为规格继续有效；既有工作区修改保留，未提交或推送。

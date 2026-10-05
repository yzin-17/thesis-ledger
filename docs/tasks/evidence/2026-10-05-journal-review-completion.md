# 投资复盘交互与任务恢复验证

验收依据为[原规格 AC1—AC16](../../specs/2026-08-28-journal-review-trade-projection.md)，本轮范围为[收口任务 J4—J8](../2026-10-05-journal-review-completion.md)。真实模型内容沿用[revision 2 的目标证据](2026-10-05-journal-model-content-v2.md)，本轮没有重复提交该内容验收。

## 实现与输入范围

- 单笔与周期分析分别保留最近成功结果；后续分析失败仍可读。修改周期窗口后保留旧结果，但不允许把旧结果提交给新窗口 AI。
- AI 引用按账户、模式、单笔或周期冻结输入生成摘要键；浏览器会话存储只保存版本与任务 ID，以及最多十条近期 ID，不存储事实、草稿或 AI 正文。恢复只读取已存在任务，不自动创建付费任务。
- 恢复响应必须匹配账户、模式、对象、证据及草稿，或周期窗口与投影引用；Query 缓存包含对应摘要，不能复用未经当前输入校验的报告。
- 历史快照展示可读来源、临时草稿及保存时 AI 元数据；原始 JSON 位于默认关闭的高级详情。
- 新增 `jsdom@26.1.0` 只服务 Desktop 的真实 React 挂载测试；未改变 Server 运行时依赖、Journal Schema 或算法。

## 本地测试与门禁

测试使用 React DOM、TanStack Query、真实事件与组件状态，区别于仅生成静态 HTML 的测试。

| 输入范围 | 结果与证据 |
| --- | --- |
| Desktop 全量 `pnpm --filter @thesis-ledger/desktop test` | 91 个文件、611 个测试通过；`/private/tmp/tl-journal-desktop-suite-final.log` |
| Desktop typecheck 与 build | 通过；`/private/tmp/tl-journal-desktop-build-last.log`；既有产物体积提示保留 |
| Journal domain/schema/API client/Server 定向契约 | 51/12/6/74 个测试通过；8 个需要 PostgreSQL 的测试条件式跳过，未计为数据库验收；`/private/tmp/tl-journal-contract-suite.log` |
| 新增真实挂载测试 | AI 引用恢复 16、近期任务 3、单笔 7、周期 5、候选 9、快照 3；包括损坏引用、恢复失败、响应错配、分页冲突、晚响应、局部重试、键盘焦点与标签点击 |
| 边界、workspace 依赖与文件规模 ratchet | 通过；规模检查以 `GUARDRAIL_BASE_REF=HEAD` 执行，九个既有存量债务没有增长；`/private/tmp/tl-journal-file-size.log` |
| 定向 ESLint/Prettier | 最终 UI 输入与本轮文档已通过；只读维护脚本不在 ESLint 的覆盖范围，另以 `node --check` 验证 |
| `git diff --check` | 主仓与 infra 已通过；未提交关联或未关联 WIP |

上述日志是本机验证记录，不等同于可公开发布的 CI 产物。

本轮六份 Journal 文档的 25 个本地 Markdown 链接均存在。真实浏览器及远端 CI 未计入这些本地检查。

## 目标与外部验收

本次部署使用 `DEV_DATABASE_MODE=upgrade DEV_DATABASE_CONFIRM=thesis-ledger-dev/thesis_ledger bash scripts/update.sh thesis-ledger`，在修复 Compose 5.5.1 的 Buildx context 传递后退出 0。正式入口使用 Compose 导出等价 Bake 定义并显式绑定已验证 context；空间、更新锁、备份与结构门禁均保持。没有新增扩容操作。

| 目标层 | 当前证据 |
| --- | --- |
| 升级输入 | 32 个 migration、80 张预期表（64 Prisma、16 raw-owned）；head `20261005143000_authoring_analysis_application` |
| 备份恢复演练 | `thesis-ledger-infra/.database-upgrades/run.tSho8O`；18,750,758 字节备份；SHA-256 `6fe09232dc40b7910370b8422d26eef6a375f2b5bd8cd1d540ee013038e97cec` |
| 隔离演练 | 旧 head `20261004140000_strategy_authoring_records` 恢复后升级至当前 head；结构、应用角色权限、原数据保留均通过 |
| 目标事务与结构 | 事务成功，实际 database/owner 均为 `thesis_ledger`；当前 SchemaVersion、80 张 public 表与结构门禁通过 |
| 运行态 | 五个业务服务健康；Server/Worker 镜像已更新，DSA 原镜像保持；Server/Worker 没有缺表或结构不符日志 |
| 保护性 API 读取 | `node scripts/journal-target-read-smoke.mjs` 退出 0；三个账户经济哈希与 v2 基线一致，候选一周期/两片段、两份历史快照可读 |
| 旧模型报告 | 单笔 `e2c829d1-6ad6-4325-81bb-26e931047669` 七条引用、周期 `67e14795-2113-4174-b366-9c95db6ddb14` 三条引用；均 succeeded、v2；默认 LMStudio revision `2` 保持 |

实际事实保留原始 decimal `4.600000000000000003`，确定性与模型报告按既有算法展示净收益 `4.6`；未修改账本以消除精度差异。

## 目标故障发现与修复

首次目标运行 `5ca9fa5a-1f07-45c9-a266-7a17ae17b0ac` 在 dispatching 后重启，发现恢复只识别 `research-v1`，将复盘 prompt 误放入通用重排；SDK 门禁阻止第二次请求，但 attempt 增至 2，错误码为 `research_execution_failed`。该原终态保留，未伪装为成功。

按[恢复归属规格](../../specs/2026-10-05-journal-research-recovery-ownership.md)修复 AI 恢复条件，不反向依赖 Journal。新增定向九项与隔离 PostgreSQL 十项通过，覆盖各版本单笔/周期 prompt、损坏冻结研究元数据和通用 NULL 元数据。Server 类型、构建、ESLint、边界与文件规模 ratchet 均通过。

官方 `sync-code.sh thesis-ledger` 兼容预检通过后，目标新运行 `34abe590-02d6-4bb9-8018-17ec2909bd5a` 在同一 Server 容器与镜像重启后收敛为 `failed/research_unknown_outcome`；保持 attempt 1 和一个请求 ID，跨调度周期没有重发。Worker、账本、默认配置和旧报告均不变。日志为 `/private/tmp/tl-journal-target-recovery-fixed.log`。该证据证明发送授权后的安全恢复，不证明外部收到请求或是否计费。

最终再经 `update.sh thesis-ledger` 将恢复修复固化到镜像，成功后记录镜像身份和保护性读取；快更本身不能作为镜像发布证据。

第一次最终镜像更新因宿主空间低于 20 GiB 门禁而在构建前停止。清理后的 Docker 磁盘块随后实际回收，宿主 `df` 复测为 23,462,708 KiB 可用，Build Cache 为 0；未扩容或降低门槛，使用同一官方入口重新执行。当前容器恢复模块的 SHA-256 已与本次 Server 编译产物一致。

最后官方更新退出 0，日志为 `/private/tmp/tl-journal-final-image-update-reclaimed.log`。Server/Worker 使用 `sha256:99eceddcd672da579570c6c43c32757844e14315141d018a42b005620f4da6c4`，镜像内恢复模块与宿主编译产物一致；DSA 镜像不变，五个业务服务健康。保护性 API 读取复验退出 0，三个账本哈希、两份旧 v2 报告及默认 revision 2 保持。修复已固化到镜像，不再仅依赖快更可写层。

更新结束后的独立回滚镜像维护报“不能借用其他进程的更新锁”，停止淘汰并单独告警；服务更新未被回滚，没有实际删除历史镜像。该维护集成问题属于空间对话负责的保留策略，不能把已完成替身测试或只读计划当作实际清退成功。

本轮浏览器再次因已保存拒绝设置阻断本机页面；未绕过浏览器权限，没有新增截图或真实浏览器验收。真实 React 挂载测试补齐了状态证据；按用户调整后的本轮范围，真实 Web 浏览器/窄屏与远端 CI 分别保留未完成状态，目标在途恢复已独立通过。

用户已要求禁止扩容。空间诊断由新对话负责，本对话继续投资复盘；后续应用更新仅经项目脚本执行。

# 三仓取消 pnpm 版本绑定任务

规格：[三仓取消 pnpm 版本绑定](../specs/2026-11-14-unpinned-pnpm.md)。

## 写集与边界

ThesisLedger：根清单、四份 GitHub 工作流、Server Dockerfile、开发要求和本主题文档。infra：根清单、兼容性工作流、测试工具规则。DSA：只读检查。保留三仓其他任务的修改，不提交、发布或更新运行态。

## 实施

- [x] 检查三仓清单、配置、CI、Docker 和当前说明；确认 DSA 无版本绑定。
- [x] 移除本地清单绑定，CI 改用 `latest`，镜像显式安装浮动 pnpm。
- [x] 更新当前说明，保留历史证据和业务依赖锁文件。
- [x] 验证 JSON、YAML、Docker 输入顺序与本地 pnpm 解析；记录结果。

## 外部验证与接续

- [x] GitHub Actions 已实际执行，主仓四个已执行任务的浮动 pnpm 安装和冻结依赖通过，infra 的浮动安装通过。
- [x] 复用 11 月 19 日的正式镜像构建。infra `DEV_DATABASE_MODE=check ./scripts/update.sh thesis-ledger` 退出 0，构建使用浮动安装的 pnpm 12.21.0，当前 Server、Worker 均使用该镜像。
- [x] 主仓 Lint 堆内存修复已通过本地验收。Server、Desktop 的源码与测试使用独立 ESLint 进程。Node 24 在 4 GiB 堆上限下执行正式 Lint 和复杂度、文件尺寸门禁均通过，文件清单逐路径一致。 [复现与验收](../evidence/2026-11-22-active-task-followup.md#主仓-ci-lint-堆内存复验)
- [ ] 修复后的远端完整门禁回执待验。主仓策略优化集成夹具、infra 镜像复用测试和主仓 Lint 修复已有本地通过证据。原远端失败保留。 [原 CI 结果](../evidence/2026-11-22-active-task-followup.md#工程与外部条件)

## 验证记录

- 三仓根目录分别执行 `pnpm --version`：均返回 `12.16.1`；检查各清单无 `packageManager`、`devEngines.packageManager`、Volta pnpm 或 `engines.pnpm` 绑定，锁文件摘要不变。
- 使用仓库已有 YAML 解析器读取五份工作流：12 个 pnpm 安装步骤均显式使用 `latest`。Dockerfile 的 registry 环境位于 `npm install --global pnpm@latest` 之前，保留依赖冻结安装。
- `node scripts/check-workspace-dependencies.mjs`：通过，8 个 workspace 包。
- infra 根目录 `pnpm check`：宿主环境通过，退出码 0；运行时、部署依赖边界和兼容合同检查均通过。最初沙箱调用停留在 pnpm 12 的在线依赖策略校验，已停止该次调用；未降低策略或修改配置，改由宿主完整执行验证。
- 三仓当前可执行配置复扫：无精确 pnpm 版本绑定；检查无新增 `_tmp_*` 残留。
- 主仓 `git diff --check`：通过。DSA 未写入文件；infra 既有未提交修改保持原样。
- 上述为 11 月 14 日本地验证记录。后续真实 CI 与镜像回执见上节。

# Docker 构建缓存重试实施任务

对应 Spec：[`../../specs/2026-09-01-docker-build-cache-retry.md`](../../specs/2026-09-01-docker-build-cache-retry.md)

## 任务

- [x] T1：收敛 DSA 前端依赖安装与更新脚本的单次重试行为
  - 覆盖验收标准：AC1、AC2、AC3、AC4
  - 依赖：无
  - 涉及范围：`daily-stock-analysis/docker/Dockerfile`、`thesis-ledger-infra/scripts/update.sh`、`thesis-ledger-infra/scripts/update.test.sh`、`thesis-ledger-infra/scripts/test-support/fake-docker.sh`、`thesis-ledger-infra/docs/docker-update-workflow.md`
  - 完成条件：前端依赖层使用不带 `--include` 参数的 `npm ci`，且不含 `tsc` 断言；更新脚本在可运行的首次失败后仅执行一次 `docker builder prune --all --force`，从更新流程起点重试一次；预检失败、首次成功与第二次失败均符合 Spec。
  - 验证方式：运行 Bash 语法检查和脚本行为测试，检查 Dockerfile 的依赖安装命令以及脚本中禁止的缓存清理范围。
  - 验证证据：
    - `rg -n -- 'npm ci|--include|tsc' docker/Dockerfile`：仅命中标准 `npm ci`，不含 `--include` 或 `tsc`。
    - `bash -n scripts/update.sh scripts/update.test.sh scripts/test-support/fake-docker.sh`：通过。
    - `bash scripts/update.test.sh`：通过；覆盖首次成功、构建首次失败后重试成功、两次构建失败、启动首次失败后重试成功和无效预检参数。
    - `git diff --check`（目标仓库已跟踪文件）：通过。

## 最终一致性 Review

- [x] Spec 中的全部验收标准均有对应实现
- [x] 所有已勾选任务均有验证证据
- [x] 所有任务依赖均已满足且无错误阻塞关系
- [x] 跨任务接口、类型和命名保持一致（如适用）
- [x] 不存在未解决的 Blocking 问题、占位描述或未定义的实现契约
- [x] 实现未超出 Spec 声明的范围
- [x] 测试策略、测试实现与验证结果一致
- [x] 测试与文档已同步更新
- [x] 必要实施 Step 均已验证
- [x] 未发现实现、Spec 与任务文档之间的不一致

### Review 结论

- 结论：通过。静态检查和 Docker CLI 替身行为测试覆盖全部验收标准。
- 发现的问题：无。
- 验证命令与结果：Dockerfile 关键字检查、`bash -n scripts/update.sh scripts/update.test.sh scripts/test-support/fake-docker.sh`、`bash scripts/update.test.sh` 和目标 diff 的空白检查均通过。

## 运行时验收补充

- 日期：2026-09-02
- 结果：真实 `update.sh` 更新流程已由用户验证通过。
- 归档结论：静态/替身验证与真实更新运行时验收均已完成，本 Task 不再承担当前执行门禁；Spec 继续保留在 `docs/specs/` 作为更新重试行为的当前说明。

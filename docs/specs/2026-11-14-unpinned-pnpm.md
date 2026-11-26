# 三仓取消 pnpm 版本绑定

## 目标与范围

本地开发使用当前 PATH 中的 pnpm，不由项目清单触发指定版本的自动切换。检查 ThesisLedger、DSA 与 infra 的清单、工具配置、CI 和镜像构建入口。

## 行为合同

- ThesisLedger 与 infra 移除根清单的 `packageManager` 版本绑定；子包及其他工具配置不能保留等价绑定。
- CI 的 pnpm 安装使用 `version: latest`，不依赖已移除的清单字段。
- ThesisLedger 镜像构建通过已配置 registry 安装 `pnpm@latest`，不再依赖 Corepack 从项目推导版本。
- 继续使用已有 `pnpm-lock.yaml` 与 `--frozen-lockfile` 固定业务依赖，本轮不重新安装或升级依赖。
- DSA 当前是 Python 数据服务；确认不存在绑定后保持其源码和历史文档原样。
- 保留 Node.js 版本、原生编译要求、部署正式入口和全部既有未提交修改。真实 CI、镜像构建和运行态更新不在本轮执行范围。

## 验收

1. 三仓当前可执行配置不存在精确 pnpm 版本绑定，CI 安装入口有显式浮动版本。
2. 本地两个 Node 项目及 DSA 目录中的 `pnpm --version` 使用同一已安装版本，执行后不重新生成版本绑定或遗留空临时文件。
3. 修改后的 JSON、工作流 YAML 和 Docker 安装顺序有效，依赖锁文件不变。
4. 记录静态和本地验证结果，不把它们表述为真实 CI 或镜像验收。

## CI Lint 内存补验

2026-11-22 续查主仓 `quality`。Server 和 Desktop 各按实现、测试及其余文件分组，由独立 ESLint 子进程串行检查。每组完成后随进程退出释放类型与依赖分析缓存。其余工作区继续按现有归属检查。

- `pnpm lint` 和 `pnpm guardrails:complexity` 共用分组。沿用原 Git 与 ESLint 文件清单、配置、规则、告警上限及失败退出方式。所有文件各进入一组，规则依然能解析跨组依赖。
- 用 Node 24 在旧 CI 的 4 GiB 堆限制下验证现行输入。对比分组前后的精确文件集，并执行正式 Lint 与复杂度门禁。真实 CI 的结果归属于实际运行记录。

实施状态见[任务](../tasks/2026-11-14-unpinned-pnpm.md)。

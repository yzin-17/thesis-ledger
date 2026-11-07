# Desktop 测试存储环境隔离验证

关联[规格](../../specs/2026-11-07-desktop-test-storage.md)与[任务](../tasks/2026-11-07-desktop-test-storage.md)。当前共享工作区有其他任务正在修改策略界面；不将这些修改归入本次配置变更，不提交工作区。

## 故障基线与修复

运行器为宿主 Node 26.13.0、锁定 Vitest 3.2.7、jsdom 26.1.0。项目 `.nvmrc` / `.node-version` 保持 24。

修复前执行：

```sh
env -u NODE_OPTIONS pnpm --filter @thesis-ledger/desktop exec vitest run test/global-mode-transition.ui.test.tsx test/performance-workspace.ui.test.tsx test/research-form-v2.ui.test.tsx --reporter=json --outputFile=/tmp/goal-webstorage-before.json
```

三个文件共 30 项失败，分别在 `localStorage.clear` 或 `setItem` 处取得 undefined。更早使用额外环境选项的完整包结果为 1341 通过、2 失败；两个策略摘要文件在该轮执行期间被其他任务改动，不能作为稳定输入的通过结果。

配置层仅在 `apps/desktop/vite.config.ts` 增加 Vitest 配置类型与 `poolOptions.forks.execArgv: ['--no-experimental-webstorage']`。浏览器环境继续由 jsdom 提供存储，不注入自制存储模拟，不改变测试发现、隔离、断言、超时或生产运行时。

修复后执行普通包入口：

```sh
env -u NODE_OPTIONS pnpm --filter @thesis-ledger/desktop test test/global-mode-transition.ui.test.tsx test/performance-workspace.ui.test.tsx test/research-form-v2.ui.test.tsx --reporter=json --outputFile=/tmp/goal-webstorage-after.json
```

三个文件共 30 项通过，退出 0。故障前后的命令均显式移除 `NODE_OPTIONS`；实际调用带 `rtk proxy` 作为输出代理。原始摘要位于上述 JSON 与同名前缀 `.log` 文件，关键结果在本文保留。

## 验证边界

已核对锁定版本声明、执行实现及[Vitest 官方配置](https://v3.vitest.dev/config/#pooloptions-forks-execargv)、[Node 官方开关](https://nodejs.org/api/cli.html#--no-experimental-webstorage)。普通包入口在宿主 Node 26.13.0 实测；随后使用本机已有 Codex Node 24.22.1 直接运行锁定 Vitest，三个存储回归与两个关闭保护文件共 41 项通过，均清除 `NODE_OPTIONS`。未下载运行器、改动依赖、数据库、Docker 或外部服务。

后续默认完整包为 236 个文件、1349 项通过；消费者扩展后再完成稳定输入的 237 个文件、1352 项通过，生产构建、配置类型检查、适用 ESLint、边界、依赖图与尺寸门禁通过；集成输入和并行变动的适用范围由[共享验证记录](2026-11-07-draft-close-races.md#本地测试与构建)持有。原完整包剩余的 `variant="compact"` 断言按当前只提供紧凑摘要的接口改为核对 `StrategyV2Summary` 接线，原有摘要业务渲染断言全部保留，两文件 18 项通过。

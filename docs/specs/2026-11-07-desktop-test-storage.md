# Desktop 测试存储环境隔离

## 问题与目标

项目使用 jsdom 模拟浏览器存储。宿主机 Node 26 默认暴露的 Web Storage 会抢占测试环境中的同名全局变量，导致账户模式、收益工作区和研究表单测试在 `localStorage.clear/setItem` 处失败。此前必须手工设置 `NODE_OPTIONS=--no-experimental-webstorage`，普通测试命令不能稳定复现已有通过结果。

通过 Desktop 的 Vitest 配置，将该选项限定在默认子进程测试池，使 jsdom 继续拥有浏览器存储。保留既有 Vite 插件、别名、测试隔离与断言；不改变应用运行时、项目 Node 24 要求、依赖或其他包的测试环境。

## 行为与验收

- AC1：不设置 `NODE_OPTIONS` 时，原先失败的全局账户模式、收益工作区和研究表单测试通过；浏览器存储仍来自 jsdom。
- AC2：普通 `pnpm --filter @thesis-ledger/desktop test` 自动消费配置，不依赖额外 Shell 包装或平台专属环境变量语法。
- AC3：测试发现、隔离、超时和断言保持有效；不跳过失败测试，不增加 ignore，不修改业务代码来适应测试。
- AC4：Desktop 类型检查与生产构建、相关仓库门禁通过。共享工作区中不属于本改动的失败必须单独归属，不能据此声称整包通过。

## 边界

仅修改 Desktop 测试配置、本主题文档，以及已独立复现的陈旧集成断言。当前唯一此类断言为回测弹窗仍检查已移除的 `variant="compact"`；改为核对实际摘要组件接线，摘要业务内容继续由已有渲染测试验证，不更改策略实现。使用当前锁定 Vitest 3.2.7 的 `poolOptions.forks.execArgv`；项目默认池为 forks。其他测试池不在本次支持范围。Node 官方将关闭 Web Storage 的选项登记为自 22.4 起可用，覆盖项目要求的 Node 24；未取得其他 Node 实测结果时不扩张版本验证结论。

配置依据：[Vitest 3 子进程参数](https://v3.vitest.dev/config/#pooloptions-forks-execargv)、[Node Web Storage 开关](https://nodejs.org/api/cli.html#--no-experimental-webstorage)。实施状态见[任务](../archive/tasks/2026-11-07-desktop-test-storage.md)。

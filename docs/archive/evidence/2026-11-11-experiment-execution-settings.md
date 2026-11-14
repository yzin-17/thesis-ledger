# AI 实验执行设置与历史数据方式验收

## 范围与结果

桌面 AI 实验的新建页和旧实验面板共用 `OptimizationPricePreparation`，均改为自动取得模拟成交设置，移除手写执行模型 JSON 与额外模型确认操作。已有策略沿用策略佣金、最低佣金和滑点；探索模式按现有种子使用零佣金、零滑点，直接披露研究假设。准备行情与创建实验继续使用原有显式入口。

新增 `/strategy-optimization/run-config/execution-model` 只读取本地策略和生成研究设置，不请求外部行情、不调用 AI、不持久化策略或实验。模型规则仍由 Backtest 所有；探索来源引用 `app:strategy-space-v1`，没有虚构已保存的策略版本。新增接口按身份检查已有策略归属，再读取设置。

“历史输入性质”改为共享的“历史数据使用方式”，同时用于普通回测和 AI 实验。默认选项说明现在取得的复权历史序列可能包含后来公司行动影响；严格模式要求历史重建证据。协议值、证据引用、冻结策略与历史记录保持原语义。Mobile 的独立回测配置没有纳入本次桌面实验入口变更。

## 定向测试与构建

9 个相关测试文件、39 项测试通过，包含：

- Server：`test/strategy-optimization/optimization-model-resolution.test.ts`、`test/strategy-optimization/optimization-model-access.test.ts`、`test/backtest/strategy-research-model.test.ts`，共 15 项。覆盖已有策略费用继承、探索 CN/HK/US、币种拒绝、基金拒绝、无效区间、不复权拒绝、失效版本和访问隔离。
- API Client：`test/optimization-model-resolution.test.ts`、`test/backtest-model-resolution.test.ts`，共 9 项。覆盖取消信号、探索范围、币种、市场、类型和区间匹配、阻断结果及发送前校验。
- Desktop：`test/optimization-preparation.test.tsx`、`test/optimization-execution-model.ui.test.tsx`、`test/backtest-model-disclosure.test.tsx`、`test/saved-strategy-backtest.ui.test.tsx`，共 15 项。覆盖无手写配置入口、未就绪禁用、中文说明、旧请求取消和晚到结果隔离，以及普通回测原行为。

分别以 `pnpm --filter <包名> exec vitest run <上述文件>` 执行。`schemas`、`api-client`、`server`、`desktop` 包构建通过；访问边界补充后重新通过 Server 测试和构建。Desktop 保留已有大分包提示。

相关源码与测试的定向 ESLint、`scripts/check-boundaries.mjs`、`scripts/check-workspace-dependencies.mjs`、`git diff --check` 通过。尺寸门禁退出 0，保留 6 项既有超限警告；没有有效全仓尺寸基线，不声明存量债务已解决。浏览器 `.cjs` 脚本被项目 ESLint 配置忽略，其验证依据为实际执行。

## 浏览器

可重复入口：

```sh
PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright pnpm exec node apps/desktop/scripts/check-experiment-settings.cjs
PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright pnpm exec node apps/desktop/scripts/check-experiment-settings.cjs --live-readonly
```

受控样本和真实页面均覆盖 1440、1024、768、390 宽度，横向溢出均为 0，可见控件不越界，没有页面异常。布局检查排除共享组件供可访问性使用的 1 像素隐藏控件。已目视检查窄屏受控样本与真实页面截图。

受控样本验证设置读取失败及重试、无 JSON 输入、准备失败后输入保留、严格模式无证据时不发请求、填写证据后的协议内容、前后复权切换、目标及日期变化后的设置重取。所有行情准备 POST 均被浏览器拦截，不访问真实行情。最初的受控失败样本缺少必填建议操作，曾产生响应契约错误；补齐后全部通过。页面同时展示建议操作，断言按完整诊断文本匹配；构建触发的开发页重载不计为通过，最终在构建结束后的稳定输入上重新验收。

真实页面使用已有 `B4-Android-Authoring-Controlled v2` 进入新建实验向导，读取实际自动设置并切换历史模式、聚焦与填写证据输入，不提交。浏览器拦截全部业务写请求，只允许 GET 和无持久化副作用的设置解析接口；记录的业务写请求为 0。没有创建实验或运行回测，也没有调用付费模型。

临时截图及结果位于 `/tmp/experiment-settings-qa/`，包括 `controlled-<宽度>.png`、`live-<宽度>.png` 和两份结果 JSON；不作为仓库生成物跟踪。

## 部署与运行态

在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 使用正式入口 `./scripts/sync-code.sh thesis-ledger`，通过现有 Node 26 可执行路径运行，符合入口的 Node 24 或更新版本要求。目标原本运行且健康；没有依赖、Schema、migration 或 Dockerfile 变化。

首轮快更退出 0，Server 与 Worker 健康，镜像 ID 不变，脚本报告未变更数据库结构和外部卷。独立调用探索设置解析接口：`300058.SZ`、CNY、后复权返回 HTTP 201 和 `available`，范围与请求一致；改为 USD 返回 `blocked / rules-incompatible`。

策略归属校验补充后，使用相同目录、入口和目标完成最终快更，退出 0。独立 Docker 只读状态显示 Server 与 Worker 健康，DSA、PostgreSQL、Redis 继续运行；再次调用探索接口仍分别返回 `available` 与币种不匹配的 `blocked`。最终重新执行真实页面四宽验收，全部取得自动设置、无溢出、无业务写请求。最终日志分别位于 `/tmp/experiment-settings-sync-final.log` 与 `/tmp/experiment-settings-browser-live-final.log`。

快更只更新容器可写层，不声明镜像已更新或完成生产发布。

## 最终一致性检查

已核对自动设置、费用继承与披露、数据可见性文案、请求隔离、失败恢复、访问边界、模块方向和真实页面布局。已有工作区其他改动保留；未提交或推送。验收不扩展为完整行情来源支持、严格历史重建能力认证、真实实验执行或 Native 编译结论。

# 实验候选具体差异验收记录

对应[规格](../../specs/2026-11-11-experiment-candidate-diff.md)与[归档任务](../tasks/2026-11-11-experiment-candidate-diff.md)。

## 实现与读取边界

原完整候选只保存 `full-strategy` 标记；原 Desktop 标量展示也会丢失对象和数组。Server 现在在一次候选查询中，按实验的 `baselineStrategyVersionId` 与候选的 `candidateStrategyVersionId` 关联不可变版本，复用完整定义比较，再按业务字段分组生成 `diff`。内部两份定义在投影后移除，现有结果读取保护继续执行。

参数候选保持原差异；完整定义相同、冻结基线缺失和冻结候选无效分别返回明确状态。历史候选、定义、采纳及回测均不回写，没有新增 Schema、migration 或队列行为。

Desktop 的 `StrategyExperimentCandidateDiff` 展示字段、基线与候选值。入场、退出及风险规则复用现有策略摘要；对象和数组保留可展开的完整定义，空值、未设置与布尔值分别表达。候选详情、采纳审阅及旧 `StrategyOptimizationExperimentResults` 入口共享展示。Mobile 的 `OptimizationDetailScreen` 原本直接展示 `candidate.diff` JSON，能够读取新的完整内容，因此保留原组件，未修改原生依赖。

## 本地检查

- Server：`vitest run test/strategy-optimization/strategy-optimization-adoption.test.ts test/strategy-optimization/strategy-optimization-candidate-diff.test.ts test/strategy-optimization/strategy-optimization-read.test.ts`，3 文件、12 项通过；包含单查询、内部载荷移除、对象/数组、缺失版本、相同定义及隐藏测试指标保护。
- Desktop：`vitest run test/strategy-experiment-candidate-diff.test.tsx test/strategy-experiment-detail.test.ts test/market-experiment-recovery.ui.test.tsx test/strategy-center-ui.test.tsx`，4 文件、33 项通过；包含具体中文入场与风控说明、完整定义、缺值、空值、布尔值和输入不改写。
- Server 构建、Desktop 类型检查及构建通过。Desktop 构建保留已有分包体积提示。
- 依赖边界通过。文件尺寸门禁退出 0，仍有 6 个既有超限警告；未提供有效基线，不将其当作全仓债务消除的证据。
- 新专题源码和测试使用 Prettier 格式化；`git diff --check` 通过。

## 正式运行态

执行目录 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`，入口 `./scripts/sync-code.sh thesis-ledger`，退出 0。兼容性预检及服务就绪检查通过，仅替换应用产物并重启 Server/Worker，镜像保持不变，没有数据库结构或卷变更。日志为 `/tmp/experiment-diff-sync.log`。快更位于容器可写层，不代表镜像重建。

Server 容器 `thesis-ledger-dev-thesis-ledger-1` 为 healthy，镜像为 `sha256:4a541fd6135c0ffd81aea7088e940bcbbb4b7edebb1a5c7f82266ddb7fe534ce`。按实际启动命令定位 `dist/src` 后，专题模块宿主与容器 SHA-256 均为 `8ebde97f01c55a6f06675d43fd1eeea199a0b982cad4458a4f73f348384b06f9`。

真实实验 `5f1c7bae-dc55-4314-a6c4-3c6e8bd3a00b` 的正式 compare GET 返回 HTTP 200。候选现在包含 `$.description`、`$.entry`、`$.name`、`$.risk` 四个分组，具体新增上穿 20 日均线的入场限制，以及止损 5%、止盈 10%、最多持有 10 个周期。

部署前后对基线运行与指标、候选版本 ID、执行哈希、原提案、验证状态、运行引用、指标及已采纳版本形成相同摘要：`28bcb89bff8ab9bd93ef57f746485499275bc5799838d8d39f3d07500331298f`。核对范围内业务结果一致，响应没有泄露内部版本载荷。读取未发起 AI、Provider 或新回测任务。

## 浏览器

复用已运行 Vite，真实路径为 `/strategy/experiments/5f1c7bae-dc55-4314-a6c4-3c6e8bd3a00b`。1440、1024、768、390 四宽展开候选差异，均显示四个字段及具体规则，横向溢出为 0，无页面异常；展开、收起再展开正常。

1440 与 390 另逐一展开全部完整定义，确认可读取 `discovery-primary` 等原始来源标识，溢出仍为 0。已目视检查桌面与窄屏实际截图。会话截图位于 `/tmp/experiment-candidate-diff-qa/`，最终简洁截图为 `1440-summary.png`、`390-summary.png`，完整定义截图为同宽 `-expanded.png`。临时截图不作为仓库固定输入。

## 结论

AC1–AC4 按实际范围通过。验证对象是既有真实冻结版本及服务端投影，不是重新生成的候选。未提交或推送 Git；没有当前范围内待补义务。

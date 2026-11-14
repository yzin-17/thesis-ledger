# AI 实验标的名称验证记录

日期：2026-11-12。对应[规格](../../specs/2026-11-12-experiment-instrument-display.md)和[任务](../tasks/2026-11-12-experiment-instrument-display.md)。

## 实现与范围

- AC1：公共实验读取合同增加可选 `executionSymbol` 与 `instrumentDirectory`。列表在分页后、详情在返回前，通过 StrategyOptimization 的名称投影调用 Market `InstrumentDisplayService.resolveDirectory`；完整代码去重后批量解析，每个响应只附加自身范围的目录条目。
- AC2：Desktop 主列表与版本关联列表的来源行使用名称在前、代码在后的显示；详情展示当前标的，新建确认区复用已有目录/选择器名称，长名称在现有 Badge 内换行。Mobile 列表和详情复用同一 Native 标的组件。分页保留每个实验的目录投影，不增加客户端查名请求。
- AC3：目录未知、同级歧义或故障回退完整代码。实验持久化名称、默认名称、策略定义、运行配置及冻结记录均不改写；列表仍以用户实验名为标题，当前标的名称显示在来源行。关联回测的分组名称和历史业务产物没有重命名。
- AC4：定向测试覆盖重复代码、相同代码不同市场、目录缺失/歧义/失败、旧基线名称、已有策略和从零探索、分页与历史内容不变。名称读取已纳入 `scripts/instrument-display-boundaries.mjs`，由现有 `check-boundaries.mjs` 执行门禁。

## 验证结果

主仓命令经 RTK 执行，日志位于本机 `/tmp/experiment-names-*`，可重建日志和截图未纳入 Git。

| 验证 | 结果 |
| --- | --- |
| Server `experiment-instrument-display`、`strategy-optimization-read` | 12 测试通过；最后修正样本名称后名称测试 5 项再次通过 |
| Desktop `experiment-instrument-display`、`market-experiment-recovery.ui` | 12 测试通过；最后修正样本名称后展示测试 2 项再次通过 |
| `node --test scripts/instrument-display-boundaries.test.mjs` | 5 测试通过 |
| 构建与类型 | Schemas、Server、API Client、Desktop 构建通过；Mobile 类型检查通过 |
| 门禁 | 受影响 Schemas、Server、Desktop 源码和测试 ESLint、边界、workspace 依赖、`git diff --check` 通过；尺寸门禁保留 6 个既有警告 |

目录测试使用真实 `InstrumentDisplayService` 与本地目录解析逻辑，Prisma 查询受控：重复实验只进行一次 Instrument 批量查询，按代码和市场区分结果，各实验只附加自身条目；旧 Asset 查询没有调用。读取前后对比输入行，用户实验名与旧基线定义保持原样。目录故障注入的预期日志没有被当作实际环境故障。

## 浏览器与真实读取

命令：

```sh
PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright pnpm exec node apps/desktop/scripts/check-experiment-instrument-display.cjs
PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright pnpm exec node apps/desktop/scripts/check-experiment-instrument-display.cjs --live-readonly
```

Desktop 使用本地 5173 端口；Mobile 组件以 `pnpm --filter @thesis-ledger/desktop exec vite --config test/price-research.vite.config.mjs` 提供的 5187 端口验证。两种模式均覆盖 1440、1024、768、390 宽度。

- 受控模式：实际实验列表和详情组件分别显示标的名称、代码及原来源模式，自定义名称保持；Mobile 的实际标的组件使用相同公共投影。无横向页面溢出、裁切和页面异常，无业务写入。
- 真实模式：直接读取更新后的实际实验列表和详情，以响应目录中的名称为断言输入，不硬编码猜测证券名称；所有非 GET 请求阻断，4 个宽度均通过，业务写入为 0。
- 已查看桌面列表、390 宽详情、Mobile 组件及更新后的真实列表截图。回执与截图在本机 `/tmp/experiment-instrument-qa`。Mobile 为 React Native Web 映射验证，无原生工程变更，不声称设备安装或真机验收。

实际 API 返回 `executionSymbol: 300058.SZ`、目录 generation 36、名称“蓝色光标”；列表来源行为“蓝色光标 · 300058.SZ · 从零探索”，详情为“蓝色光标 · 300058.SZ”。其他既有 `600519.SH` 实验显示“贵州茅台”。原持久化标题“从零探索 · 300058.SZ”仍原样保留。

最初受控样本将 `300058.SZ` 的名称误写为“东方财富”；核对真实目录后已修正为“蓝色光标”，相关测试与受控浏览器重新通过。实际实现始终读取目录，不使用样本名称或硬编码代码名称映射。

## 部署与独立运行态

执行目录 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`，通过 RTK 执行正式入口 `PATH=/Users/yzin/.volta/tools/image/node/26.13.0/bin:$PATH ./scripts/sync-code.sh thesis-ledger`，退出码 0。兼容性预检与应用构建通过，Server 和 Backtest Worker 健康，镜像 ID 保持不变，未修改数据库结构或外部卷。快更位于容器可写层，不代表镜像已重建。

更新后通过实际 API 和四宽真实页面核对当前目录投影，名称可读，原实验名称和业务状态没有被本任务改写；没有保存路由、创建或重试实验、调用模型。没有以容器健康代替行为验收。

## 最终一致性审查

通过。列表和详情均在主响应中携带目录信息，详情、版本关联列表、新建确认及 Mobile 使用同一当前名称语义；历史名称与冻结文本保持原样。批量查询、完整代码、故障降级与分页经验证，边界规则同步维护。规格、当前设计和索引已更新，任务完整范围完成并归档，没有延期或未决事项，未提交或推送。

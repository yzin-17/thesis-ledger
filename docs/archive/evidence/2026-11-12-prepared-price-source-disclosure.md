# 准备结果双来源披露验证记录

日期：2026-11-12。对应[规格](../../specs/2026-11-12-prepared-price-source-disclosure.md)与[任务](../tasks/2026-11-12-prepared-price-source-disclosure.md)。

## 实现与覆盖

- AC1：普通和实验成功响应增加可选 `actualPriceSource`，复用现有冻结来源结构，检查原价日线类型、执行用途、标的和已有原价窗口。Backtest 直接保留 `readPriceResearchReference` 已验证来源，已有版本、草稿种子与实验适配均透传，不新增路由或来源补查。
- AC2：Desktop 普通准备和实验准备复用 `PreparedPriceSources`，分别显示后复权、不复权的 Provider、上游和主/备用索引。普通非研究来源沿用原标签，未规划参考窗口不显示原价；有旧参考窗口但缺少来源时提示重新准备，不猜测提供方。
- AC3：Mobile 普通准备摘要与实验准备复用 Native 组件，显示相同独立来源和索引，保留原证据及流程。无原生工程或依赖变更。
- AC4：定向测试核对来源透传、不同索引、旧响应兼容、未规划输入和错误元数据；真实接口与实际组件浏览器验证如下。

## 定向与包级验证

主仓命令均通过 RTK 执行，原始日志为本机 `/tmp/prepared-sources-*`，未跟踪可重建日志与截图。

| 验证 | 结果 |
| --- | --- |
| Schemas `test/backtest-run-preparation-v3.test.ts` | 11 测试通过 |
| Server `price-research-pair`、`price-research-snapshot` | 17 测试通过；分别返回原价主/备用索引，保留旧响应和最小依赖 |
| Server `strategy-optimization-preparation-http` | 1 测试通过；已有版本与从零探索均返回富途后复权、Tushare 原价备用；旧响应可解析，错误复权元数据拒绝 |
| Desktop `prepared-price-sources`、`optimization-preparation` | 6 测试通过；双来源、缺失提示、未规划原价和原准备校验 |
| 构建与类型 | Schemas、API Client、Server、Desktop 构建通过；Mobile 类型检查通过 |
| 门禁 | 受影响 Schemas、Server、Desktop 源码及测试 ESLint，边界、workspace 依赖与 `git diff --check` 通过；尺寸门禁保留 6 个既有警告 |

初次 Schemas 构建发现来源 RouteKey 也可能为 data 类型，已先检查 `kind: bar` 再读取复权字段。修正后完成构建，再执行依赖新合同的测试。HTTP 回归另发现草稿适配未透传原价来源，已补齐并分别验证已有策略与从零探索，没有用浏览器受控返回代替接口验证。

## 浏览器验收

使用本机 Edge 与实际组件，宽度覆盖 1440、1024、768、390，无横向溢出、裁切或页面错误。

- Desktop：`PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright pnpm exec node apps/desktop/scripts/check-experiment-create-validation.cjs`。受控准备返回富途后复权主源、同花顺原价备用，分别确认两行显示；同时保留预算零值、空输入拒绝、失败同幂等提交重试和成功导航。卡片单独截图防止完整页面截图中的固定导航遮挡来源。
- Mobile：以 `pnpm --filter @thesis-ledger/desktop exec vite --config test/price-research.vite.config.mjs` 提供实际 Native 组件的 React Native Web 映射，执行 `apps/desktop/scripts/check-mobile-experiment-research.cjs`。四宽确认研究版本采用、失败重试和双来源主备文本，无业务写入。该结果不代表真机编译或设备验收。
- 已查看 Desktop 390 宽的独立准备卡片截图与 Mobile 390 宽截图，两套来源均完整可读。截图路径为本机 `/tmp/experiment-create-validation-qa/prepared-sources-*.png`、`/tmp/mobile-experiment-research-qa/sources-*.png`。

准备与创建 POST 在受控浏览器中被拦截，无用户实验创建；自动执行设置解析不调用 AI。UI 仅读取准备响应，没有新增行情或路由请求。

## 部署与真实响应

在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 经 RTK 执行 `PATH=/Users/yzin/.volta/tools/image/node/26.13.0/bin:$PATH ./scripts/sync-code.sh thesis-ledger`，退出码 0。兼容性预检和应用构建通过，Server、Backtest Worker 更新后健康，镜像 ID 保持不变；未修改数据库结构或外部卷。快更位于容器可写层，不代表镜像已重建。

对更新后的本地 Server 调用自动执行设置解析与实验准备接口，代表标的 `300058.SZ`，研究区间 2025-11-16 至 2026-11-10，从零探索、后复权固定快照、预热预算 60。返回 HTTP 201、`prepared`，原价窗口已冻结，响应直接包含：

| 字段 | Provider / 上游 | 索引 | 有效路由版本 |
| --- | --- | --- | --- |
| `actualSource` | `futu / futu` | 0，主源 | 199 |
| `actualPriceSource` | `hithink / hithink-financial-api` | 0，主源 | 199 |

这是实际接口来源；浏览器受控样本使用原价备用索引 1 验证独立主备显示，二者未混为同一证据。真实准备只读取行情并生成冻结证据，没有创建用户实验、保存策略或路由，也没有调用模型。

## 最终一致性审查

通过。来源来自各自已冻结窗口，普通准备、草稿适配、实验响应、公共解码与两端卡片一致；元数据不参与改写既有运行配置、提交意图、预算或历史来源。未规划和旧响应明确区分，来源主备索引独立展示。有效规格及索引已更新，任务全范围完成并归档，没有延期或未决事项，未提交或推送。

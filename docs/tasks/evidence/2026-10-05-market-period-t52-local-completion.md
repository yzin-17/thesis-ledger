# T5.2 周期偏好、能力与工具栏本地收尾证据

日期：2026-10-05。对应[原 Task 的 T5.2](../../archive/tasks/2026-09-16-market-chart-period-aggregation.md)及[完整 Spec](../../specs/2026-09-16-market-chart-period-aggregation.md)。用户本轮授权执行 T5.2；完成本叶后停止，不自动推进 T6/G1/P1/R1。

## 本地收尾结果

T5.2 的本地完成条件通过，原 T5.1 已完成，父 T5 共同收口。以下结论属于受控组件交互、源码接缝和本地工程验证，不代表目标部署、真实 Provider、浏览器完整矩阵或 500 点性能。

本次修正两个已确认缺口：

1. 原周期能力仅请求 `barsLimit=2`，却用于启用非年度实际 90 点的图表。现在非年度周期消费 90 点计划能力，年度消费实际 2 点计划能力，两个 TanStack Query 缓存键均带条数及复权口径；两点可用而 90 点不可用的月线不会显示为可选，90 点年度不可用也不会误禁两点年度。
2. 原回退提示只保存文本，切换标的后可能继续显示上一标的的不可用提示。提示现在绑定 symbol；偏好仍按标的持久化，另一个标的不显示旧提示。

不调整 Server/Domain/DSA 合同、聚合、来源事实、窗口预算或指标公式。能力 available 仍只证明日历/路由/预算前置，不能证明实际历史足够或来源持续成功。能力查询失败未被解释成成功确认不可用，也不会删除已保存偏好。

## 完成条件与证据对应

| T5.2 本地断言 | 证明方式 | 边界 |
| --- | --- | --- |
| 周期与区间正交，按标的保存 | 真实挂载 MarketPeriodSelection、MarketPriceChart 和项目 ToggleGroup，实际点击周期/区间，核对 localStorage 并卸载重开 | 图表底层 canvas 以受控替身隔离；不证明真实浏览器拖动 |
| 仅显示对应窗口可用周期 | 受控 API 分别返回 90 点与 2 点能力，核对选项及实际请求参数；三种复权口径的请求键与参数直接测试 | 使用真实 TanStack Query 调度和项目 UI，不调用 Provider |
| 能力失效回退 1d、中文解释并持久化 | 更新当前查询缓存，等待组件调度，核对当前周期、中文提示和保存值；年度两点能力独立控制回退 | 能力变化由受控缓存注入，不冒称上游真实变化 |
| 标的隔离及基金无周期组 | 切换另一标的确认旧提示不残留、各标的偏好保留；禁用时确认无周期工具栏且能力 API 零调用 | 实际基金 NAV 与真实页面仍由 G1 验收 |
| 周期切换清空页和视口、迟到响应隔离 | 复核现行 Dialog 的 `symbol:timeframe` 重挂载边界；运行既有页合并、协调器、latest、视口及 T5.1 周期消费测试 | 没有把受控页/键测试替代 G1 的真实分页矩阵 |
| 周期中文、派生及基础来源可见 | 挂载正式 Chart，核对中文周期、派生来源及基础来源文案；既有分段、完成状态和读数回归 | 合成点仅用于组件验证，来源成功沿用 T3 独立证据 |

现有区间、图形和指标偏好的存储保持原实现；本叶采用原 Task 明确的“按标的持久化周期”要求，不引入所有标的共享同一周期的新行为。Spec AC6 的“跨标的复用”措辞与正文“按标的全局复用”的一致性仍归最终 R1 核对。

## 文件责任边界

- `apps/desktop/src/features/market-detail/MarketPeriodSelection.tsx`：实际窗口能力、查询键及标的提示隔离。
- `MarketPeriodSelection.test.tsx`：三种复权口径的 90/2 查询键与参数。
- `MarketPeriodSelection.interaction.test.tsx`：六项受控挂载交互；复用真实 TanStack Query、正式 Chart 和项目 UI，只替换 API 与图表 canvas。
- `MarketDetailDialog.test.tsx`：原 mock 对所有查询返回同一详情数据；本次按查询键区分周期能力与详情夹具，不修改真实 Dialog 行为。
- `apps/desktop/test/market-period-benchmark.tsx`：既有 P1 准备夹具同步两种查询键，避免缓存失配；未启动性能服务器或浏览器采样。
- 原 Task 及本证据：只更新本叶状态和验证边界。

未修改 manifest、lockfile、共享 Schema、Server、DSA、数据库或部署脚本。没有添加组件、覆盖本地 shadcn 组件或新增 CSS。

## 最终验证

命令通过 `rtk proxy` 执行；测试、类型、build 和 lint 按原 Task 要求在后台运行。以下是最后一次结果，早期已修正的测试夹具和 React act 类型错误不作为当前失败。

| 检查 | 命令或范围 | 最后结果 |
| --- | --- | --- |
| 两文件定向行为 | Desktop `pnpm exec vitest run src/features/market-detail/MarketPeriodSelection.test.tsx src/features/market-detail/MarketPeriodSelection.interaction.test.tsx --maxWorkers=2` | 12 项通过，随后完整套件覆盖最终输入 |
| 行情详情回归 | Desktop `pnpm exec vitest run src/features/market-detail --maxWorkers=2` | 23 文件、108 项通过，无跳过；耗时 6.94 秒 |
| Desktop 类型 | 根目录 `pnpm --filter @thesis-ledger/desktop typecheck` | 退出 0 |
| Desktop 构建 | 根目录 `pnpm --filter @thesis-ledger/desktop build` | 退出 0；Vite 保留既有大 chunk 告警 |
| 本次五个代码/测试文件 lint | 根目录 `pnpm exec eslint` 加下列五个输入路径 | 退出 0，无 lint 告警；未提高阈值或增加 ignore |
| 新挂载测试格式 | `pnpm exec prettier --check apps/desktop/src/features/market-detail/MarketPeriodSelection.interaction.test.tsx` | 通过；没有整仓格式化 |
| 边界与依赖 | `node scripts/check-boundaries.mjs`、`node scripts/check-workspace-dependencies.mjs` | 通过；依赖图 8 个包 |
| 文件尺寸 ratchet | `GUARDRAIL_BASE_REF=514abeebfe57bac0c16271439d8b777ff3b02a9f node scripts/check-file-size-guardrails.mjs` | 通过，9 项存量超限告警未增长 |
| 性能准备消费兼容 | Desktop `node scripts/build-market-period-benchmark.mjs` | 退出 0，生产夹具重新生成；不是 P1 性能通过 |
| 差异卫生 | `git diff --check` | 通过 |

## 被验证输入

工作区 HEAD 为 `514abeebfe57bac0c16271439d8b777ff3b02a9f`，包含既有未提交修改，不能把 HEAD 单独当成完整测试输入。本次五个代码/测试文件 SHA-256：

| 输入 | SHA-256 |
| --- | --- |
| `apps/desktop/src/features/market-detail/MarketPeriodSelection.tsx` | `7b88a6d28df3842f523bebbabba8aa341c31a858d340667f9f9fc7a905d82880` |
| `apps/desktop/src/features/market-detail/MarketPeriodSelection.test.tsx` | `ee94d4e276bfb1d82eb90ddaf381db9b6567522f8bdf4121bee76d2f6a621fd3` |
| `apps/desktop/src/features/market-detail/MarketPeriodSelection.interaction.test.tsx` | `fd67b06c89c2ded3659abc3d693ebefd734a1e40b8d9e4afa0a37a90b9243e53` |
| `apps/desktop/src/features/market-detail/MarketDetailDialog.test.tsx` | `b9a13991b8e6a3e0ae665229e56d50d9206f059db8eae56e20762d2abbe4228c` |
| `apps/desktop/test/market-period-benchmark.tsx` | `dfd63eff601265758e641a6e0d640aacc7f27e4f9fcae76256924a6032d7284d` |

原始本地日志：`/private/tmp/tl-t52-market-final.log`、`tl-t52-types-final.log`、`tl-t52-build-final.log`、`tl-t52-lint-complete.log`、`tl-t52-size.log`、`tl-t52-benchmark-build.log`。临时日志可能被后续清理，本文件保留实际统计、关键断言及被验证输入摘要。

项目锁定 shadcn CLI 的 `info --json` 和 `docs toggle-group alert` 已执行，确认 Vite、Base UI、Tailwind v4、现有 alias 和已安装组件；读取官方组件文档并保留现有组件组合，没有升级 CLI 或依赖。

## 局部 Review 与停止边界

本叶局部 Review 通过：两个缺口与修复/行为证据一致；按标的偏好、实际窗口能力、中文回退、基金隔离和旧行情行为满足本地完成条件，源码依赖方向与门禁一致。T5.1 的页隔离成果继续有效，父 T5 可以关闭。

T6 的完整集成核对、G1 的真实浏览器/Network/拖动分页/回退/截图、P1 的 500 点长任务及请求形态、R1 的全部 AC 最终一致性继续保持未完成。本轮没有 Docker 操作、目标 HTTP、真实 Provider、浏览器或性能采样，没有数据库变更、提交、推送、reset 或清理，保留既有 dirty 修改。

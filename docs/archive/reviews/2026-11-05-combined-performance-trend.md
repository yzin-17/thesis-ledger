# 资产总值与累计盈亏同图验收

## 范围与结果

依据[同图规格](../../specs/2026-11-05-combined-performance-trend.md)，完成 Desktop/Web 收益分析页签的同图展示。[实施任务](../tasks/2026-11-05-combined-performance-trend.md)已完成本地验证与最终一致性复核。沿用当前脏工作区，未覆盖既有修改；本轮相关文件的修改前副本位于 `/tmp/thesis-ledger-combined-trend-20261105/before/`。

## 实现与断言

| 断言               | 实现与证据                                                                                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1 双轴与统一控件 | `PerformanceTrendChart` 同时绘制实线资产与虚线盈亏，左／右轴分别标注金额与币种，保留盈亏零基线；资产区间和粒度为唯一控件。1440／390 截图已逐张复核。                                                           |
| AC2 原值与缺口     | 资产来自原序列，盈亏来自原历史接口及 `portfolioPnlPoints` 当前点投影；金额计算未变化。几何模型仅转换坐标，按原盈亏空点分段，不补零、插值或用资产增减替代盈亏。                                                 |
| AC3 共用区间       | 默认沿用资产的近 1 年。1 日／5 日从盈亏近 1 月读取结果筛选，近 5 年从全部结果筛选；其他选项直接映射。测试覆盖短区间、五年、零值与空点。资产粒度保留原语义，盈亏仍是收盘记录与当前估值。                        |
| AC4 共享取点       | 游标按两类记录的真实时间并集定位，数值按精确时间匹配；缺少另一类记录时显示无记录，盈亏缺数显示原原因。保留资产质量、披露／定价覆盖率及已实现／未实现说明。鼠标、指针按下、方向键和 Escape 的真实组件回归通过。 |
| AC5 独立状态与范围 | `PerformanceAnalysisTrend` 接入原 TanStack Query；历史失败保留当前／缓存，独立重试不隐藏资产；资产失败也保留盈亏。当前估值不可用时仍可读盈亏历史。模式、账户迟到隔离、刷新一次请求及配置草稿回归通过。         |
| AC6 多币种         | 未合并资产保留原分币种路径，盈亏只进入其原本位币对应图，不将不同资产币种加到同一尺度。真实组件回归验证两个资产币种只出现一份对应币种盈亏。                                                                     |

取消分析页签的互斥指标切换，移除被替代的 `PortfolioPnlChart.tsx`、`PnlTrendChart.tsx`；原盈亏交互测试迁移至 `performance-analysis-trend.ui.test.tsx`，继续覆盖当前金额、零值、历史不足、缺口、重试与迟到响应。资产点明细、首次配置引导、公共账户／换算工具栏、四页签及目标保存操作保留。

## 验证

在 `apps/desktop` 使用 `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run … --reporter=dot`：

- `performance-combined-trend.test.tsx`、`performance-analysis-trend.ui.test.tsx`、`performance-workspace.ui.test.tsx`、`performance-ui.test.tsx`、`performance-read-state.test.tsx`、`performance-mode-account-scope.ui.test.tsx`、`performance-pnl-model.test.ts`：7 文件 47 项通过。
- `portfolio-query-demand.test.ts`、`portfolio-account-filter.ui.test.tsx`、`performance-target-save.test.tsx`、`global-mode-account-journey.ui.test.tsx`：4 文件 32 项通过。
- Desktop `pnpm run build`（含 `tsc --noEmit`）通过，保留既有大 chunk 提示。
- 本次应用编排、图表／投影源码与新增／迁移测试的 `pnpm exec eslint` 通过；`pnpm exec node scripts/check-boundaries.mjs` 通过；文件格式、差异空白及关联文档链接通过。

本轮未重复全包回归；此前全包的四项其他模块既有失败见[入口合并验收](2026-11-05-performance-workspace.md)，不记为全仓通过。

## 浏览器证据与限制

通过临时 Vite 预览入口构建真实 `PerformanceAnalysisTrend`，预置查询缓存和固定资产数据，使用应用现有 CSS 与真实浏览器响应式布局，浏览器阶段不读取业务 API。用 taste skill 的 `shoot.mjs` 与 `layout/check.mjs` 执行，1440／390 截图已人工复核；布局检查覆盖 1440×900、1024×768、768×1024、390×844，没有报告横向溢出或边缘越界。

检查器退出码为 1，仅报告四项 `screen-short` 与八项 `hero-fold`，均来自营销全屏 Hero 假设；本应用图表按内容高度排版，这些项目不适用。未修改检查器，也不将整个检查器记为通过。浏览器固定输入用于验证布局与真实组件，不代表真实历史充足、目标服务已部署或完整应用性能。

截图、日志和源码指纹保存于 `/Users/yzin/.codex/visualizations/2026/11/05/01a1aa9f-a6f8-7631-95a5-5d400a1dc132/combined-performance-trend/`；原始日志位于 `/tmp/thesis-ledger-combined-trend-20261105/`。临时预览入口已移除，可重建产物未加入 Git。

## 最终一致性复核

同图曲线与当前生效文档一致；数据来源、缓存范围、零值、未知状态、缺口及当前估值口径已核对，局部验证覆盖全部 AC，无当前范围内遗留事项。未修改 Server、Schema、数据库或收益计算算法，未提交、推送、更新 Docker、调用外部 Provider 或修改 Mobile。

## 页面文案精简

按后续用户反馈，删除统一页头的英文前缀和介绍、全局换算的重复说明与图表底部重复口径句，使用“全历史收益率”短标签。估值计算时间与收益快照时间合并到公共状态行，保留各自标签；汇率日期、估算／陈旧／不可用状态和重试入口仍可见。图表计算说明、空态和单点提示缩短，当前单点不再重复提示没有历史。资产明细、当前金额、缺数原因、截断提示和全部业务操作保留。

本轮复用既有四组真实组件回归，41 项通过；修改仅涉及展示文案、重复提示和元数据排列，不新增业务测试。最终构建、ESLint 与差异格式检查通过；日志以 `copy-` 前缀存于原证据目录，没有更新 Docker 运行态。

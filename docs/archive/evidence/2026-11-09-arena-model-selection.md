# 模型筛选选中态与筹码能力提示核对

## 修复与原因

模型筛选原来使用固定 `outline` 变体的普通 Button，虽更新 `aria-pressed` 和 `entrantId` 查询参数，但没有对应的选中外观。改为现有 ToggleGroup 单选组，当前模型与“全部模型”使用共享选中态；重复点击已选项保留选择，切换模型和切回全部同步点位。长模型名称在窄屏内换行，保留图表实例与已有请求逻辑。

新增回归先在原实现上因缺少选中外观状态失败，修复后验证单模型请求、点位由两条变一条、切换模型、切回全部恢复两条及图表不重建。

## 验证

- `pnpm --filter @thesis-ledger/desktop exec vitest run src/features/model-arena/ArenaPriceLayer.test.tsx src/features/model-arena/arena-price-points.test.ts`：11 测试通过，含前序空结果 Toast 与图表保留场景。
- Desktop build、两文件 ESLint 和 `git diff --check` 通过，保留既有 bundle 尺寸提示。
- 使用真实 ArenaPriceLayer 和原生图表，在受控浏览器的 1440、1024、768、390 宽度验证：选中背景和未选背景不同、空格键选模型、服务端模拟筛选、全部恢复、重复点击保留选择、canvas 节点保留、无页面横向溢出。浏览器脚本最初误将 TradingView 署名链接计入模型点位数，修正为比赛链接后全部通过。
- 截图与机器结果：`/tmp/arena-model-selection-qa/`；脚本 `/tmp/check-arena-model-selection.cjs`；日志 `/tmp/arena-model-selection-*`。人工检查了 390 宽度选中长模型名称的实际页面。

本次为宿主 Desktop 源码和构建更新，由现行 Vite 服务加载；Server 与数据库未修改，没有执行 Docker 更新。

## 真实只读状态

读取实际模型比赛、参赛模型及点位接口：截图首个“招商银行 · 同花顺五条新闻双模型回放 · 2026-11-06 晚”比赛有两个模型，在 2025-11-10～2026-11-09 区间的全部模型与两个分模型请求均返回 0 条点位。按钮选中态修复不制造不存在的模拟成交。

读取 `600036.SH` 的 chip 详情及当前数据策略：总开关为 enabled，策略已 applied，但没有 `CHIP_SUMMARY` 路由，故“筹码摘要”返回 `capability_not_enabled`。K 线和实时报价是独立配置的能力，这条提示仅解释筹码摘要不可用。没有自动启用数据来源、触发模型运行或写入真实业务数据。

只读响应摘要：`/tmp/arena-model-selection-runtime.json`、`/tmp/cmb-chip-detail.json`、`/tmp/cmb-policy-reasons.json`。模型点位筛选和绘制的交互验证使用受控数据，不冒充真实比赛已有成交。

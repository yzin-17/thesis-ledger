# MACD 图层遮挡验收

日期：2026-11-08；对应[规格](../../specs/2026-11-08-macd-series-layering.md)与[归档任务](../tasks/2026-11-08-macd-series-layering.md)。

## 原因与结果

原渲染器按 DIF、DEA、柱体的顺序创建序列，后绘制的柱体覆盖了两条折线。现使用当前安装版本 `ISeriesApi.setSeriesOrder`，在无用序列清理完成后固定零轴、柱体、DIF、DEA 的从后到前顺序，避免原生库删除序列后重新编号影响结果。

顺序操作由 `market-macd-series-order.ts` 持有，原大函数只增加一次调用，没有新增控制分支。没有修改指标计算、输入点、参数、颜色、价格格式配置或其他 pane。最终视觉检查还保持了独立模型入口按内容宽度显示。

## 验证

| 检查 | 输入与结果 |
| --- | --- |
| 绘图辅助、pane 标注与指标模型定向测试 | 三文件 15 项通过 |
| 行情模块回归 | 44 个文件、197 项通过；旧叠加测试保留非阻断的 `act` 提示 |
| Desktop `pnpm build` | 最终源码类型检查与构建通过，保留既有大包体提示 |
| 变更渲染器、顺序 helper、模型入口及夹具 ESLint | 通过 |
| 导入边界、`git diff --check` | 通过 |

## 原生画布回归

使用本机 Vite、Microsoft Edge、Playwright 与 `check-macd-layering.cjs`。受控样本包含正、负 MACD 柱，DIF、DEA 均落在柱体覆盖的价格范围内，柱值遵循 `2 × (DIF − DEA)`；指纹与来源口径一致，实际使用生产渲染组件。

- 修复前 1440 复现失败：在正、负两段采样带中，两条线都仅有约 2.88% 的列可见，主要是柱间缝隙。
- 修复后 1440、1024、768、390 的初次显示、数据刷新、全屏及返回共 16 组全部通过；每组的正负采样带内，DIF、DEA 可见列比例均为 100%。
- 1440 追加验证从 RSI 切回 MACD，序列重新建立后仍全部可见；最终布局小调整后再次执行该宽度五个阶段，全部通过。
- 已目视核对桌面与 390 截图，正负柱上两条折线完整显示。全屏同时存在 RSI 时，MACD 的顺序仍正确。无页面横向溢出、浏览器错误或 API 读取。

修复前、四宽修复后及副图恢复数据分别保存在 `/tmp/codex-market-range-qa/macd-layering-before/`、`macd-layering-after/`、`macd-layering-reentry/`，最终桌面结果位于 `macd-layering-final/`。测试、构建日志为同级 `macd-layering-tests.log`、`macd-layering-build.log`。这些临时验收产物不纳入 Git。

## 最终一致性核对

AC1–AC3 已通过，原生绘制顺序、序列复用及文档状态一致。验收使用受控绘图数据，未读取或改写真实行情、账本及指标事实，未提交或部署。保留工作区其他修改，无新增待办。

# 模型点位首次点击与图表稳定验收

## 原因与实现

原 `ArenaPriceLayer` 在关闭状态直接渲染图表，开启后替换为包含另一份图表的 `SelectedLayer`。开关因此会卸载原生图表，丢失图表自身状态并短暂重建。另一个问题是空结果没有恢复关闭，sessionStorage 仍记为开启，而按钮始终为 outline；恢复后第一下点击可能实际执行关闭，因而不触发空结果 Toast。

现在模型读取和选择由 `useArenaPriceData` 管理，使用原有 TanStack Query；图表固定在同一子组件位置。数据读取、开关、空结果与失败仅更新控制区和点位叠加；没有模型点位时沿用原成交/成本叠加引用，不重置价格序列。

成功空结果先按主动操作门控提示，再自动关闭并清理已记住的开启状态。被动恢复的空结果静默关闭，下一次主动点击即可重新读取并反馈。有效数据仍保留比赛/模型选择和开启状态，按钮通过共享变体明确表达开关。关闭状态不发起新模型请求；来源失败继续显示独立错误。

未修改后端、业务数据库、真实比赛、依赖或全局 Toast。工作区改动未提交。前端开发入口使用当前源码，生产前端构建通过；本次不执行 Docker 更新。

## 组合测试与回归

命令均使用 `rtk proxy`，日志位于 `/tmp/model-first-click-*.log`。

1. 先在原实现运行新组合测试，3 项均失败：首次开启替换图表节点、恢复的空结果仍保持开启、关闭导致图表累计挂载 3 次。日志为 `model-first-click-baseline.log`。
2. 修复后组合测试覆盖首次异步空结果、恢复开启的空结果、加载中关闭、有比赛时模型筛选与跳转。验证 Toast 次数、开关状态、原图表节点与缩放、点位传入和关闭清理。结合既有门控测试，最终 10 项通过。
3. `pnpm --filter @thesis-ledger/desktop exec vitest run src/features/model-arena src/features/market-detail`：49 文件、220 项通过。扩展回归曾发现关闭模型时额外读取浏览器 origin 和挂载路由消费者的问题，已增加安全 origin 读取、仅实际点位存在时挂载跳转组件；静态图表测试使用真实查询上下文，未将业务图层 mock 掉。
4. `pnpm --filter @thesis-ledger/desktop build`：类型检查与 Vite 构建通过，保留既有产物分块尺寸提示。
5. 本次生产代码 ESLint、复杂度 20 检查通过。查询状态分类独立为领域函数，无阈值或 ignore 放宽。
6. `scripts/check-boundaries.mjs`、以 HEAD 为基线的文件尺寸门禁及写集 `git diff --check` 通过。6 个既有文件尺寸告警均未增长。

## 浏览器

本机 Edge，入口均使用真实 React、TanStack Query、Dialog、Toast 和 Lightweight Charts；模型列表、详情及点位为受控样本，不访问真实 Provider 或修改比赛。

### 空结果与实例稳定

`apps/desktop/scripts/check-arena-empty-toast.cjs` 在 1440、1024、768、390 四种宽度通过：

- 首次点击时人为延迟列表，确认加载中图表与 canvas 保持；成功空结果弹出一次 Toast，按钮恢复关闭。
- 在操作前放大并平移图表，操作后对同一 canvas 的图像摘要进行比较，四种宽度均完全相同；图表节点、画布节点和上边缘位置保持。
- 连续主动点击只保留一个 Toast 节点，约 3.3 秒自动消失；手动关闭、圆角、无阴影、弹窗内定位和滚动补偿保持。
- 旧版已记住的空图层恢复后静默关闭，随后第一下点击可提示；关闭状态刷新不新增模型读取。
- 周期切换、全屏恢复和后台状态不自动提示；显式关闭后拒绝迟到空结果；失败保留错误并与空结果区分。

结果与截图为 `/tmp/arena-empty-toast-qa/`，最后命令日志为 `/tmp/model-first-click-browser-final.log`。

### 有效模型点位与视图操作

`apps/desktop/scripts/check-chart-view-tools.cjs` 四种宽度均通过。验证周线桶正确绘制模拟买卖标记、原始事实日期保持、模型选择和比赛链接、分钟周期说明及恢复开启；同时覆盖基金/股票视图、缩放、全屏、成本参考、测量取消和边界。

结果与截图为 `/tmp/chart-view-tools-qa/`，日志为 `/tmp/model-first-click-view-tools.log`。首次运行使用了错误的浏览器路径参数，未启动浏览器；改用脚本已有的 `CHART_TOOLS_CHROMIUM_EXECUTABLE` 指定本机 Edge 后通过，未下载浏览器或修改依赖。

`apps/desktop/scripts/check-chart-reference-tools.cjs` 亦在四种宽度通过，核对空结果恢复关闭后的再次点击、工具行顺序、折叠独立性、图表间距、测量取消与全屏。对应日志为 `/tmp/model-first-click-reference-tools.log`。

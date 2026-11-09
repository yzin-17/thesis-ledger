# 风险规则工作台高度与选择空态验收

日期：2026-11-07。对应[现行交互规格](../../specs/2026-08-23-risk-center-interaction.md)。

桌面规则工作台保留固定左右布局，两栏拉伸到页面可用区域底部并同高。右侧区域始终保留，未选中时显示居中的选择空态；完全没有规则时，左侧展示创建引导，右侧仍保留选择空态。归档列表展开仍需手动选择，收起后恢复选择空态。窄屏继续纵向排列。仅调整展示与空态位置，保留原有操作、加载与业务请求。

- 定向测试：`pnpm --filter @thesis-ledger/desktop exec vitest run test/risk-center-interaction.test.tsx test/risk-actions.recovery.ui.test.tsx`，35 项通过。
- 修改组件与现有测试 ESLint 通过；`git diff --check` 通过。
- 本机 Edge，开发服务器 `http://127.0.0.1:5173`，1440／1024／768／390 四宽，1000px 视口高度。每宽核对收起、展开、首次选择、切换选择、再次收起，共 20 个真实页面状态；另外每宽拦截规则读取返回空数组，验证 4 个受控空列表状态。
- 1440 与 1024 桌面宽度，列表与详情的纵向起点、高度一致，底部与页面可用容器底部一致；当前主布局保留 64px 页面底部间距。归档开关与列表项的位置在选中前后稳定，未选中与收起后右侧均出现选择空态。各宽没有页面横向溢出。
- 人工查看桌面未选中、已选中和空列表截图，两栏边框及占高正常。真实数据只读，业务写请求 0，页面脚本异常 0。受控空列表只拦截浏览器响应，未修改真实规则。

原始脚本与矩阵在本机临时目录：`/tmp/risk-rule-full-height-final.cjs`、`/tmp/risk-rule-full-height-qa/results.json`；截图为该目录内各宽的 `collapsed`／`expanded`／`selected`／`last-selected`／`recollapsed`／`empty` 状态。临时文件仅供本机复核。本记录承接[此前的布局检查](2026-11-07-risk-rule-layout-stability.md)，当前高度与空态以本记录及现行规格为准；未执行提交、发布或 Docker 更新。

# 回测任务筛选栏布局验收

## 问题与修复

策略版本筛选所在网格列固定预留 18rem，但触发器按内容收缩，剩余空白把状态筛选推到右侧。现将搜索框、策略版本与状态固定为同一行，搜索框占用剩余空间。策略版本选择器在宽屏具有 12rem 宽度，手机按比例收缩；状态选择器保持 7rem 宽度。手机标签保留可访问命名，长名称复用共享 SelectValue 的省略显示。

修改范围为 `apps/desktop/src/features/strategy/StrategyBacktestJobsPage.tsx` 的筛选栏布局，以及 `apps/desktop/test/strategy-center-ui.test.tsx` 中锁定旧布局的断言。原文件中已存在的 AI 分组标题等其他未提交修改保留。

## 验证

- 在 `apps/desktop` 执行 `pnpm exec vitest run test/strategy-center-ui.test.tsx test/strategy-center-navigation.test.ts --reporter=dot`，20/20 通过。
- `pnpm --filter @thesis-ledger/desktop typecheck`、修改文件的 ESLint 和 `git diff --check` 通过。
- Microsoft Edge 实际访问本地 Vite 的 `/strategy/jobs`，检查 1440、1024、768、390 四种宽度：三项始终同排且高度一致，宽屏筛选组间距 12px，页面无横向溢出。
- 浏览器隔离响应临时替换一个策略名称为长中文名称，验证选择后控件宽度不变、状态下拉不超出视口；状态筛选、搜索及清空搜索仍正确同步 URL。此替换只存在于当前浏览器响应，不写入真实数据。
- 页面异常和业务写请求均为零。结果与截图位于 `/tmp/backtest-filter-layout-qa/results.json`、`default-*.png`、`selected-*.png`；执行入口为同目录的临时 `check.cjs`。初始浏览器脚本的可访问名称、退出动画和路由状态等待问题已修正后完成上述检查。

修改未提交；未执行 Docker 更新。验收范围为该筛选栏及其既有交互。

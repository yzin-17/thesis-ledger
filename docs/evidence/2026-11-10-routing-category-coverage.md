# 大类覆盖诊断隔离验收记录

## 实际复现与原因

2026-11-10，通过实际 Vite 页面读取配置，点击行情类“采用建议主备”，逐类对比下拉回显及覆盖徽标。全部六类的主备回显均未变化；行情由草稿更新子项，而其余五类的覆盖徽标也全部消失。

原因位于 `RoutingConfigPanel.tsx`：全局 `state.dirty` 为真时统一传入空诊断数组。推荐函数本身只替换目标大类规则，并未改写其他类。本次修复 Desktop 的展示投影，没有修改推荐算法或服务端请求协议。

## 实现

`routing-coverage-projection.ts` 按大类比较当前草稿和基线中的规则及精确能力键。尚未预览时，只隐藏已修改类的旧诊断并标示“待预览”；未修改类保留基线诊断。多类分别修改、恢复原配置和当前有效预览使用同一投影。细分面板消费过滤后的诊断，不另行维护状态。

主页面明确说明已修改类待预览，其余仍展示已保存诊断。口径数量直接来自草稿，实际主备和单独配置数量仍消费原草稿。

## 定向和静态验证

- `pnpm --filter @thesis-ledger/desktop exec vitest run test/routing-coverage-projection.test.ts test/routing-recommendation.test.ts test/routing-config-workflow.test.tsx`：3 文件、15 项通过。新增 4 项覆盖单类隔离、多类修改后恢复、能力范围变化、有效预览和关闭后的范围恢复。
- 首次新增测试使用了未登记能力 `NEWS`，被正确归为其他类而使 2 项断言失败；改用目录中的 `NEWS_FEED` 后全部通过。
- `pnpm --filter @thesis-ledger/desktop build`：类型检查及生产构建通过，日志 `/tmp/routing-category-build.log`。
- 修改的业务文件和测试 ESLint 通过；代码、脚本及文档 Prettier 通过。
- `pnpm exec node scripts/check-boundaries.mjs` 通过；`pnpm exec node scripts/check-file-size-guardrails.mjs` 通过，保留 6 项无关存量警告。

## 四宽实际浏览器

扩展既有 `apps/desktop/scripts/check-routing-recommendation.cjs`：操作前后采集未编辑大类的主备文本、覆盖徽标、口径及单独配置数量，在采用后和预览返回修改后分别进行完整比较。原有预览提交断言继续确认非行情类规则与基线一致。

执行命令为 `pnpm exec node apps/desktop/scripts/check-routing-recommendation.cjs`，设置：

```sh
PLAYWRIGHT_MODULE=/Users/yzin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright
MARKET_ROUTE_CHROMIUM_EXECUTABLE='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
ROUTING_QA_OUTPUT=/tmp/routing-category-coverage-qa
```

实际配置、受控无 Key 两个场景均在 1440、1024、768、390 四宽通过：

- 每次仅操作行情类，其余 5 个类的选择、徽标及数量完整保持；目标类展示待预览且不混显旧异常。
- 实际配置预览仍为行情 50 项主备、21 项单源；受控无 Key 为 20 项主备、45 项单源、6 项未覆盖，推荐行为与前次验收一致。
- 实际 POST 预览的其他大类规则与读取基线完全一致，能力范围不变。
- 返回修改后隔离效果保持，两次受控保存失败请求一致，真实业务写入为 0、浏览器错误为 0。
- 无横向溢出或弹窗越界；已实际查看 1440px 和 390px 最终主页面截图。

结果和截图位于 `/tmp/routing-category-coverage-qa/`。GET 与 POST 预览连接现有实际服务，PUT 均拦截为 503；无 Key 条件只修改浏览器收到的配置和目录响应，不改变实际凭证。

## 最终核对与边界

AC1–AC2 由纯投影测试及当前预览状态验证，AC3 由逐类浏览器对比、实际提交与布局检查验证。主规格已明确按类隔离，当前修复不扩大来源选择或持久化范围。未执行 Docker 更新、真实配置保存或 Git 提交；前端由现有 Vite 加载当前源码。最终一致性核对通过，无本范围遗留事项。

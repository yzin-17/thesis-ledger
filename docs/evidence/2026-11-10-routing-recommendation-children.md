# 推荐主备应用至子项验收记录

## 实现与输入

2026-11-10，在当前未提交工作区验证。Desktop 的 `applyRoutingSuggestion` 清除选中大类全部规则后写入推荐默认，所有子项恢复继承，具体来源绑定随例外一并移除。其他大类、能力键、可信保留记录不变；后者继续由服务端按获胜规则核对。普通下拉仍使用原选择函数。按钮旁增加“同时替换本类全部细分配置”。

## 定向与静态验证

- `pnpm --filter @thesis-ledger/desktop exec vitest run test/routing-flat-scopes.test.ts test/routing-capability-options.test.ts test/routing-config-workflow.test.tsx test/routing-source-choices.test.ts test/routing-scope-tree.test.ts`：5 文件、22 项通过。覆盖整类例外清除、明确空值、精确绑定、其他大类保留、原输入不变、重复采用、普通选择保留例外及预览保存工作流。
- `pnpm --filter @thesis-ledger/desktop build`：类型检查与生产构建通过；存在现有大包体提示。
- 修改的业务文件和范围测试 ESLint、Prettier 通过；浏览器脚本 Prettier 通过。
- `pnpm exec node scripts/check-boundaries.mjs`：通过；`pnpm exec node scripts/check-file-size-guardrails.mjs`：通过，保留 6 项既有大文件警告。本次业务文件未超过阈值。
- 直接使用宿主 `node` 的两项门禁最初因 Volta 版本范围解析失败，改用项目 `pnpm exec node` 后通过；未调整环境或项目依赖。

## 实际浏览器

入口 `apps/desktop/scripts/check-routing-recommendation.cjs`；环境变量 `PLAYWRIGHT_MODULE=/Users/yzin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`、`MARKET_ROUTE_CHROMIUM_EXECUTABLE=/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`，使用 `pnpm exec node` 执行。访问实际 Vite `http://localhost:5173/market-data`，GET 与 POST 预览由现有实际服务处理，全部 PUT 拦截为受控 503，其他写请求禁止透传。

1440、1024、768、390 四宽均通过：

- 读取行情原有 50 项例外，采用推荐后本类仅剩一条大类规则，子项显示继承大类，其他大类和能力键保持。
- 实际服务端预览显示 36 项来源变化，其中 6 项清空；这是推荐组合不能覆盖所有口径的实际诊断，不扩大为全覆盖结论。预览保留的 28 项例外属于其他大类。
- 确认前没有保存请求；返回修改保留草稿；两次受控保存失败的请求内容一致，可继续修改或重试。没有实际保存业务配置。
- 页面无横向溢出、面板边界正常；浏览器错误 0，实际业务写入 0。已实际查看桌面子项及 390px 失败预览截图。

结果与截图位于 `/tmp/routing-recommendation-qa/`，包含 `results.json`、`children-{1440,1024,768,390}.png` 和 `preview-{1440,1024,768,390}.png`。

本次前端由现有 Vite 读取当前源码；未执行 Docker 更新、Git 提交或真实路由保存。通过证据仅覆盖本次整类采用行为，不证明新增 Provider 能力或线上来源可用。

## 最终一致性核对

AC1–AC4 分别由草稿变换测试、真实预览和四宽受控交互覆盖；原始输入、其他大类及真实业务配置保护成立。主规格已区分普通大类选择与整类采用推荐，任务完成后归档；无本范围未完成事项。

# 风险规则生成页关闭确认验收

## 改动

风险规则生成页复用 `useDraftCloseGuard` 和全局 `ConfirmDialogProvider`，关闭时显示与其他页面相同的确认弹窗。未修改时直接关闭；有未保存配置或预览时，继续编辑保留输入，确认放弃后返回来源版本。底部保留正常保存操作。

共享关闭逻辑透传已有导航保护的可选 `bypass` 和 `discard` 能力，其他消费者保持原默认行为。风险页在导航确认时只清理草稿，由路由前往目标页面；保存成功继续使用原有直接返回逻辑。提交中禁止关闭，确认期间草稿变化、提交或卸载仍沿用共享保护。

本轮写集为 `StrategyRiskApplicationPage.tsx`、`useDraftCloseGuard.ts` 及现有浏览器验收工具和样本，不修改 Server、数据库、依赖或原生工程。工作区既有其他任务改动保留，未提交或推送。

## 验证

- `pnpm --filter @thesis-ledger/desktop exec vitest run test/draft-close-confirmation.test.tsx test/navigation-draft-recovery.ui.test.tsx`：11 项通过。
- 风险页恢复测试按 `风险|关闭确认|账户请求|导航` 定向执行：风险相关 3 项通过，包含提交中禁止关闭、成功后读取失败不重复写入和恢复预览。
- 本次两个实现文件定向 ESLint：0 错误、0 警告；`git diff --check` 通过。
- `pnpm --filter @thesis-ledger/desktop build`：最后一次完整构建通过，日志 `/tmp/risk-close-build-final.log`。首次检查曾被 Arena 页缺少 `timeline` 的当前工作区类型错误阻塞；本次修改范围的独立类型检查及 Vite 构建当时均通过，临时检查配置已删除。

## 浏览器

实际挂载生成抽屉、共享导航保护和共享确认弹窗，使用 Microsoft Edge、现有 `http://127.0.0.1:5173` 开发服务。API 请求全部拦截，真实数据未提交。

执行：`PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright RISK_RULE_QA_OUTPUT=/tmp/strategy-risk-close-qa node scripts/local-runtime/browser/risk/strategy-rule-notification.regression.mjs`。

1440、1024、768、390 四种宽度，每种覆盖创建、编辑、未保存关闭确认、未修改直接关闭、切换路由确认，共 20 场景通过。关闭确认覆盖：继续编辑后输入保留、弹窗获得焦点后 Esc 取消、确认后返回来源页；路由确认覆盖取消留页和确认后前往指定目标。创建/编辑回归继续验证逐条通知设置、503 后保留输入及重试成功，保存成功没有再次确认。

所有弹窗边界在视口内，未出现页面异常或未登记 API 请求。截图关闭动画后检查弹窗实际外观，窄屏按钮完整可见。结果及截图位于 `/tmp/strategy-risk-close-qa/`，工具可重新生成。

诊断时发现测试在弹窗焦点切换完成前发送 Esc，会把按键发给底层关闭按钮；验收改为等待弹窗获得焦点后操作。另一个测试入口曾重复导入带挂载副作用的模块，已改为使用当前样本路由引用。最终浏览器验证经过一次开发服务上下文重载后重新执行并全部通过。

本轮仅更新 Desktop 源码与宿主构建产物，没有 Server/Worker 运行代码变化，因此未再次执行 Docker 更新。最终审查：共享默认行为、忙碌保护、保存返回、取消恢复和指定路由导航均有对应证据。

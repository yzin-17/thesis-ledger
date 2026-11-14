# 内部导航整页刷新排查与验证记录

## 初始清单

- Desktop与共享生产源码1005个，其中Desktop643个；TypeScript AST核对22处 href 属性。复盘共用 AI 面板的“配置 AI 模型”为唯一遗漏的普通内部锚点，其余19个原生锚点在新窗口打开外部资料，另2处为资料链接封装调用。
- 共用修复范围：对象复盘 `JournalAiExplanation`、周期复盘 `JournalPeriodAiExplanation`、任务历史 `JournalAiTaskHistory` 均消费 `JournalAiRunPanel`。
- 保留：回测权益 CSV 与诊断 JSON 两个 Blob 下载；ProviderOAuthPanel 的外部授权新窗口；DeferredPage 的“重新加载页面”错误恢复操作。
- 28个原生 form 均有 onSubmit，无原生 action/target 导航；未发现 reloadDocument 或其他 location 路径写入。Mobile 外部链接统一经 `safeExternalUrl` 校验后使用 Linking，不改成页面路由。

## 修复与静态验证

- `JournalAiRunPanel` 改用现有 React Router `Link`，保留 `/providers`、文案、样式及链接语义。三个共用消费者同步生效；测试挂载与两个浏览器样本补齐 `MemoryRouter` 上下文。
- Desktop 执行 `pnpm exec vitest run test/internal-navigation.test.ts test/journal-*.ui.test.tsx`：11个文件、86项通过。覆盖对象、周期、AI恢复、任务历史等既有交互；其中20项导航检查覆盖误用样本、合法外部/下载场景及全部生产源码。随后抽取 JSX 检查职责以满足复杂度门禁，20项导航检查再次通过。
- Desktop `pnpm build` 通过；既有大包提示保留。对修改的生产组件、挂载辅助及导航检查执行定向 ESLint，通过；新脚本和导航检查的 Prettier 检查通过。CJS 浏览器脚本不在仓库 ESLint 范围内，由实际执行验证。
- `scripts/check-boundaries.mjs` 通过；文件尺寸检查通过，保留6个既有大文件提示。本次未提供有效基线，该检查不代表无关存量文件的尺寸增量已获认证。`git diff --check` 通过。

## 实际浏览器与受控输入

本地 Vite `http://localhost:5173` 与 Edge 无头浏览器，分别验证1440、1024、768、390宽度。

- `scripts/check-internal-navigation.cjs`：在实际应用路由中为账户、复盘候选和确定性分析提供受控响应，每宽2次分析在浏览器内返回，其他业务写入全部阻断。鼠标点击“配置 AI 模型”与聚焦后Enter均进入 `/providers`；后退恢复原查询参数，再次打开正常；行情、复盘侧栏或底栏导航正常。每宽新增文档请求0、页面内存标识保留、真实写入0、页面异常0。入口边界及页面横向溢出断言通过，截图位于 `/tmp/internal-navigation-qa/journal-<宽度>.png`。
- `RULE_MONITOR_QA_LIVE=1` 执行 `scripts/check-rule-monitor-schedule.cjs`：四宽受控任务交互及真实配置只读验证均通过。原“前往自动化”进入正确页签，未请求新文档，后退仍保留页面内存；每宽11次受控写入、真实写入0。该脚本未触发服务端资料检查。
- 浏览器样本初次受真实账户类型限制而停止，后改用完整受控证券账户；初始化请求拦截曾误匹配 Vite 的源码路径，已限定实际 `/api/` 请求；账户样本补齐契约字段后通过。以上为验收脚本准备问题，无业务数据改动。
- 四宽人工检查入口截图，未见链接裁切、越界或横向溢出。未创建AI任务、调用模型、探测Provider或发送通知。

## 范围结论

AC1～AC3完成。静态清单与本地浏览器分别验收；本次未更新Docker容器或生产镜像，未运行远程CI，也未宣称全部动态外部地址可被静态扫描认证。所有无关工作区改动保留，未暂存或提交。

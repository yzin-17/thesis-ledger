# 风险规则归档入口置底验收

日期：2026-11-07。对应[风险中心交互规格](../../specs/2026-08-23-risk-center-interaction.md)。

归档分组贴住左侧规则栏底部；展开时向上占用剩余空间，条目仍在开关下方。活跃规则及空态说明保持顶部对齐，窄屏保留自然内容高度。实施仅调整 `RiskRuleWorkbench` 的列表刷新区域 `grow` 和归档分组 `mt-auto`，复用原有双栏、刷新和选择逻辑。

- 定向测试：`pnpm --filter @thesis-ledger/desktop exec vitest run test/risk-center-interaction.test.tsx test/risk-actions.recovery.ui.test.tsx`，2 文件、35 项通过。
- `pnpm exec eslint apps/desktop/src/features/risk/RiskRuleWorkbench.tsx` 通过。
- 本机 Edge／Playwright，开发服务器 `http://127.0.0.1:5173/risk-center?tab=rules`，视口宽度 1440、1024、768、390，高度 1000。真实 7 条归档规则，每宽核对收起、展开、选择首项、选择末项、再次收起及重新展开；另以浏览器受控响应验证完全空列表。
- 归档分组底边距列表栏底边保持 9px；桌面两栏同高、占满可用高度，选择前后列表及开关位置稳定。展开不自动选择，收起清除归档选择，再次展开保留未选择状态；四宽均无页面横向溢出。
- 已目视核对桌面收起、展开及窄屏展开截图。页面脚本异常 0，业务写请求 0。受控空列表仅修改浏览器响应，真实业务数据只读。

本机复核脚本：`/tmp/risk-rule-archive-bottom.cjs`；结果及截图：`/tmp/risk-rule-archive-bottom-qa/`。本次使用现有开发服务器，未更新 Docker 运行态或镜像。此前的[工作台高度验收](2026-11-07-risk-rule-full-height.md)继续提供高度与选择空态背景，归档位置以本记录为准。

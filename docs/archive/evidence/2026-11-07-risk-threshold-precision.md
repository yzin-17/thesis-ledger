# 风险阈值精度与共享集成验收

对应[规格](../../specs/2026-11-07-risk-threshold-precision.md)与[任务](../tasks/2026-11-07-risk-threshold-precision.md)。真实风险规则、账户和持仓保持只读，回归提交仅进入内存回调，没有业务请求或写入。

## 原始失败

两端都在打开时乘以 100、提交时除以 100。实际表单原阈值 0.3333333333333333 未编辑保存变成 0.33333333333333326；非零百分比输入 1e-323 下溢后竟提交为零。

Desktop 首轮 8 项中 4 通过、4 失败：原值变化、失焦展示需求、下溢提交为零三项为本主题回归，另一项是测试误把严重级别 ToggleGroup 当成 Select，随后按实际按钮操作修正。原结果为 /tmp/goal-risk-desktop-before.json。Mobile 首轮 8 项中 6 通过、2 失败，复现未编辑阈值变化与下溢，结果为 /tmp/goal-risk-mobile-before.json。

四宽截图还发现：输入已保留极小非零值，下方规则预览仍显示 0%。对百分比和普通数值阈值各补极小值及 Number.MIN_VALUE 的摘要测试，首轮 25 通过、4 失败，结果为 /tmp/goal-risk-summary-before.json；随后修复该共同格式化入口。

## 实现与所有权

Domain 的 ratio-percent 模块拥有稳定比例与百分比单位合同，配置目标模块保留原有语义导出并转发同一实现；没有复制换算代码。两端风险编辑器直接消费该单位接口，不引用配置目标业务或另一客户端。新增两个依赖门禁，禁止比例模块反向依赖 apps 与 API Client。es-toolkit 选型复用[已核对的官方文档与实际实现](2026-11-07-allocation-target-precision.md#工具选型)：round 和普通 multiply/divide 不满足原值往返，不新增依赖。

Desktop 用 DecimalInput 保留草稿文本，失焦压缩、聚焦恢复原值。校验与提交共同使用单位合同，下溢输入不再回退为零；描述直接说明业务范围。保存失败保留完整文本，切换严重级别不改变阈值。

风险表格、详情与规则预览共享 formatThreshold。常规精度会显示成零的非零阈值改用科学计数；普通值保留原 3 位百分比 / 6 位数值展示尺度。Intl 从完整文本生成展示值，不改阈值或风险计算。Mobile 列表原本使用科学计数仍为非零、表单预览使用原始文本，本轮核对后保留；事件详情和既有冻结记录不改写。

## 定向与包级验证

Shell 经 RTK，pnpm 测试实际使用宿主 Node 26.13.0；门禁与浏览器运行器使用本机已有 Codex Node 24.22.1。Mobile 在当前 Node 26 下显式关闭实验 Web Storage，不宣称其普通默认测试入口已修复。

| 检查 | 命令或输入 | 最终结果 |
| --- | --- | --- |
| Domain 定向 | pnpm --filter @thesis-ledger/domain test test/allocation-targets.test.ts test/ratio-percent.test.ts | 2 文件 / 23 项通过，保留配置目标 20 项并覆盖有符号、超过一及有限上界 |
| Domain 完整包 | pnpm --filter @thesis-ledger/domain test | 55 文件 / 499 项通过；/tmp/goal-risk-domain-full.json |
| Domain 构建 | pnpm --filter @thesis-ledger/domain build | 通过；/tmp/goal-risk-domain-final-build.log，之后验证消费者 |
| Desktop 最终定向 | 精度、风险中心、关闭消费者及配置目标原值 4 文件 | 46 项通过；/tmp/goal-risk-desktop-summary-targeted.json |
| Mobile 最终定向 | M15 风险、M12 目标 2 文件 | 15 项通过；/tmp/goal-risk-mobile-final-targeted.json |
| Desktop 最终完整包 | env -u NODE_OPTIONS pnpm --filter @thesis-ledger/desktop test | 240 文件 / 1389 项通过；/tmp/goal-risk-desktop-final.json |
| Mobile 最终完整包 | env NODE_OPTIONS=--no-experimental-webstorage pnpm --filter @thesis-ledger/mobile test | 48 文件 / 193 项通过；/tmp/goal-risk-mobile-final.json |
| Desktop 构建 | pnpm --filter @thesis-ledger/desktop build | 通过；/tmp/goal-risk-desktop-final-build.log，保留已有大 chunk 提示 |
| Mobile 编译 | pnpm --filter @thesis-ledger/mobile build | TypeScript 通过；/tmp/goal-risk-mobile-build.log。之后仅测试文件修改，src 与共享包输入未变，tsconfig 只包含 src，复用该结果 |
| 定向 ESLint | 13 个本主题源码、测试与受控入口 | 通过；/tmp/goal-risk-lint-final.log |
| 仓库边界 | node scripts/check-boundaries.mjs | 通过；/tmp/goal-risk-boundaries.log，包含新比例模块约束 |
| 工作区依赖 | node scripts/check-workspace-dependencies.mjs | 8 包通过；/tmp/goal-risk-dependencies.log |
| 文件尺寸 | GUARDRAIL_BASE_REF=HEAD node scripts/check-file-size-guardrails.mjs | ratchet 通过，6 个既有警告；未改阈值或 ignore |

配置目标焦点测试补充等待弹窗实际初始聚焦后再执行失焦，保留全部格式、原值、取消和提交断言；未修改共享输入的焦点行为。新增数值测试使用可表示的 number 字面量以通过 no-loss-of-precision，不通过关闭 lint 规避。

最终完整包和构建期间，Desktop 源码、测试、配置及共享包源码/构建输入共 1933 项、Mobile 源码/测试/配置共 265 项的 SHA-256 完全一致：/tmp/goal-risk-inputs-final-{before,after}.json 与 /tmp/goal-risk-mobile-inputs-final-{before,after}.json。Domain 和 Mobile src 未因摘要复核变化，不重复执行其构建；Desktop 源码变化后重新完成完整包及构建。

## 实际浏览器

[受控页面](../../../apps/desktop/test/browser-risk-threshold-precision.html)挂载真实 RiskRuleEditorSheet、确认框和 Toaster；[维护检查入口](../../../apps/desktop/scripts/check-risk-threshold-precision.cjs)支持 PLAYWRIGHT_MODULE、RISK_CHROMIUM_EXECUTABLE、RISK_QA_BASE_URL、RISK_QA_OUTPUT，不自行安装依赖或启动服务。

1440、1024、768、390 四宽各验证三分之一阈值、极小值、Number.MIN_VALUE、失败与下溢，共 16 组。核对未编辑及切换严重级别的实际提交、仅聚焦失焦直接取消、失败保留完整文本、非法/零值阻止提交、弹层边界和页面溢出；极小值同时核对预览非零与滚动可达。输入仍保留完整原值，摘要使用紧凑科学计数。

初轮及摘要修正后的运行均为 16 组通过、0 页异常、0 业务请求；最终包含滚动可达与截图的复跑同样 16 组全部通过，结果为 /tmp/goal-risk-browser-final/results.json，日志 /tmp/goal-risk-browser-final.log；已查看 390 宽极小值截图，预览科学计数可见。所有请求拦截只允许当前本地 Vite 静态资源，拒绝 API 及非本地地址，不接触真实风险规则。

## 结论边界

AC1～AC5 完成，最终浏览器后 1933 个 Desktop/共享输入及 265 个 Mobile 输入与完整包前完全一致，记录为 /tmp/goal-risk-inputs-final-browser.json、/tmp/goal-risk-mobile-inputs-final-browser.json。改动范围 git diff --check 通过。证据可供活动任务按同一输入和层级复用。未修改 Schema、依赖、原生工程或历史记录；没有 Docker 更新、外部来源、模型、通知、Git 提交、推送或发布。共享工作区其他改动保持，持续优化 Goal 保持活动。

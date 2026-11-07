# 配置目标精度与共享包集成验收

对应[规格](../../specs/2026-11-07-allocation-target-precision.md)与[任务](../tasks/2026-11-07-allocation-target-precision.md)。真实业务数据保持只读，全部提交回归使用内存回调；未发送业务请求或执行 Docker。

## 原始问题与修复

Desktop 和 Mobile 原来都对已有权重执行乘以 100、再除以 100。原值 0.3333333333333333 因未编辑保存变成 0.33333333333333326。Desktop 新提交测试首轮 1 通过、2 失败，Mobile 命令首轮 3 通过、1 失败，原始结果分别在 /tmp/goal-target-desktop-before.json、/tmp/goal-target-mobile-before.json。

Domain 配置目标模块现在从 number 的完整十进制表示生成百分比文本，只移动十进制位置；保存时从文本转换一次。Desktop 保存完整文本草稿并复用 DecimalInput，Mobile 保留普通非负小数约束、版本核对与命令结构。API 仍为 number，新输入受该合同的表达范围约束；非零下溢明确拒绝，未改变存储精度、历史值、Schema 或迁移。

合计容差与 Server 的权重 1e-8 对齐。真实截图发现 99.9995% 原来显示为 100.00% 且无不足原因；新增回归首轮 5 通过、1 失败。修复后，超出容差但会显示成 100.00% 的合计显示至六位小数并移除尾零，直接说明不足或超出。保存失败后草稿保持。

## 工具选型

已读取项目实际 es-toolkit 1.51.0 导出、声明与源码，并对照官方文档：

| 候选 | 已确认行为 | 选择条件 |
| --- | --- | --- |
| [round](https://es-toolkit.dev/reference/math/round.html) | 对 number 舍入 | 需要显式舍入时适用；不满足本次原值往返合同 |
| [compat multiply](https://es-toolkit.dev/compat/reference/math/multiply.html) / [divide](https://es-toolkit.dev/compat/reference/math/divide.html) | 最终使用普通 number 运算 | 普通数值运算适用；不能消除本次乘除往返变化 |
| 原生字符串位移与边界 Number 转换 | 在单位展示中保留原 number 的十进制表示 | 本次采用，不引入通用高精度库或依赖 |

shadcn 使用 Desktop 锁定 CLI 查看 info、Input、InputGroup 与 Dialog 文档；沿用现有组件、alias、Base UI 与 Tailwind 4。[官方 InputGroup 文档](https://ui.shadcn.com/docs/components/base/input-group)。

## 包检查与门禁

命令均从仓库根目录运行并经 RTK。门禁和浏览器使用本机已有 Codex Node 24.22.1；pnpm 测试实际使用宿主 Node 26.13.0。

| 检查 | 命令或输入 | 最终结果 |
| --- | --- | --- |
| Domain 定向 | pnpm --filter @thesis-ledger/domain test test/allocation-targets.test.ts | 20 项通过，含长小数、科学计数、极小非零、零、非法与下溢 |
| Domain 完整包 | pnpm --filter @thesis-ledger/domain test | 54 文件、496 项通过；/tmp/goal-target-domain-full.json |
| Domain 构建 | pnpm --filter @thesis-ledger/domain build | 通过；新导出构建后再验证消费者，/tmp/goal-target-domain-build.log |
| Desktop 初始定向 | 目标草稿、精度、保存、工作区 4 文件 | 29 项通过；/tmp/goal-target-desktop-after.json |
| Desktop 提示修复定向 | 精度、目标草稿、工作区 3 文件 | 26 项通过；/tmp/goal-target-desktop-feedback-after.json |
| Desktop 最终完整包 | env -u NODE_OPTIONS pnpm --filter @thesis-ledger/desktop test | 239 文件、1377 项通过；/tmp/goal-target-desktop-feedback-final.json |
| Mobile 目标命令 | env NODE_OPTIONS=--no-experimental-webstorage pnpm --filter @thesis-ledger/mobile test test/parity/m12.test.tsx | 7 项通过；/tmp/goal-target-mobile-after.json |
| Mobile 完整包 | env NODE_OPTIONS=--no-experimental-webstorage pnpm --filter @thesis-ledger/mobile test | 48 文件、188 项通过；/tmp/goal-target-mobile-final.json |
| Desktop 构建 | pnpm --filter @thesis-ledger/desktop build | 通过；/tmp/goal-target-desktop-feedback-build.log，保留原大 chunk 提示 |
| Mobile 编译 | pnpm --filter @thesis-ledger/mobile build | TypeScript 通过；/tmp/goal-target-mobile-build.log，未改原生配置，不宣称 Native compile |
| 定向 ESLint | 11 个源码、测试及入口；提示补改后再检查 2 文件 | 通过；/tmp/goal-target-lint.log、/tmp/goal-target-feedback-lint.log |
| 仓库边界 | node scripts/check-boundaries.mjs | 通过；/tmp/goal-target-boundaries-final.log |
| 依赖方向 | node scripts/check-workspace-dependencies.mjs | 8 包通过；/tmp/goal-target-dependencies.log |
| 文件尺寸 | GUARDRAIL_BASE_REF=HEAD node scripts/check-file-size-guardrails.mjs | ratchet 通过，保留 6 个既有警告；未改阈值或 ignore |
| 改动空白 | git diff --check -- 本主题源码与测试 | 通过，不扩大为共享工作区全部 diff 结论 |

Mobile 遗留的策略库用例失败也已定位：同一页面增加后台提交查询后，旧替身仍给多个请求返回同一个 Response，响应体只能消费一次。测试改为按策略列表和后台提交分别创建响应，保留草稿、使用中、归档及版本搜索断言，新增导航身份检查。定向与完整包通过；未改变策略库产品逻辑或放宽断言。

Desktop 最终完整测试、构建及浏览器前后的 1926 个源码、测试、配置与共享包源码/构建输入 SHA-256 一致，记录为 /tmp/goal-target-inputs-feedback-{before,after}.json。Mobile 完整包前后及最终复核的 265 个源码、测试和配置摘要一致，记录为 /tmp/goal-target-mobile-inputs-final-before.json 与 /tmp/goal-target-mobile-inputs-feedback-after.json。仅 Desktop 合计提示变化后复验 Desktop；没有重复执行输入未变的 Domain 与 Mobile 完整包。

## 实际浏览器

[受控页面](../../../apps/desktop/test/browser-allocation-target-precision.html)挂载真实 PerformanceTargetEditor、确认框与 Toaster。[维护检查入口](../../../apps/desktop/scripts/check-allocation-target-precision.cjs)沿用 PLAYWRIGHT_MODULE 参数，另支持 ALLOCATION_CHROMIUM_EXECUTABLE、ALLOCATION_QA_BASE_URL 与 ALLOCATION_QA_OUTPUT。不会自行安装浏览器或启动服务。

检查覆盖 1440、1024、768、390 四宽，每宽验证三等分原值、极小原值、Number.MIN_VALUE、失败保稿与临界合计，共 16 组。核对实际保存对象、仅焦点变化直接取消、其他字段编辑时保留股票原值、聚焦恢复完整文本、弹窗边界及横向溢出。填充先完成聚焦恢复原值，再替换输入。

临时验证结果 /tmp/goal-target-browser.json 中 16 组通过，页面异常和业务请求均为 0。已查看桌面及窄屏截图，临界合计直接显示 99.9995% 和不足提示。维护入口以现有 Playwright 与 Chromium 路径执行成功：/tmp/goal-target-browser-maintained/results.json 同样 16 组通过，页面异常、业务请求与真实写入均为 0；运行日志 /tmp/goal-target-browser-maintained.log。入口仅参数化运行环境与输出目录，生产输入摘要保持。

## 结论边界

AC1～AC5 已按原范围完成，最终一致性复核通过。本证据可供标的选择等活动任务按相同输入和层级复用。Server 完整包、原生编译、生产镜像、目标 Docker 运行态、Provider 和模型调用不属于本轮通过结论。共享主工作区保留其他任务未提交改动，持续优化 Goal 保持活动。

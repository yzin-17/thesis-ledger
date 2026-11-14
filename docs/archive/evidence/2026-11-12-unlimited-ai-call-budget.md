# AI 调用次数零值验证记录

日期：2026-11-12。对应[规格](../../specs/2026-11-12-unlimited-ai-call-budget.md)与[任务](../tasks/2026-11-12-unlimited-ai-call-budget.md)。

## 验证与实现

- AC1：公共预算边界增加 `maxAiCalls.unlimited: 0`，创建合同接受零值且不再要求零值满足计划最少次数，正数范围保持 1–30。Schemas 定向测试 18 项通过，包含负数、小数、字符串、缺失值、正数不足计划次数等拒绝情形。
- AC2：PostgreSQL 原子预算准入仅在零值时跳过调用次数比较，继续累计用量。复用 `scripts/test-unlimited-backtest-budget-postgres.mjs` 的隔离维护入口，13 项测试通过；两个并发申请累计至 80 次，有限额度下只有额度内请求成功，原回测零值行为保留。
- AC3：不限次数时按模型数乘轮数分配单次输出 Token 预留，测试确认 2 模型、3 轮、120 输出 Token 时每次预留 20；有限次数计算保持原样。隔离测试覆盖输入/输出 Token、费用、取消及到期，失败申请不扣次数。轮数与既有任务状态逻辑没有改变。
- AC4：共享输入自动展示“填 0 表示不限制”，新建页及旧面板显式拒绝空输入，Mobile JSON 输入说明同步。Desktop 预算组件 11 项测试通过；实际 Edge 浏览器在 1440、1024、768、390 宽度验证 AI 与回测次数均填 0、空值阻止提交、失败同幂等键重试与成功导航，全部通过，无横向溢出或页面异常。创建与行情准备 POST 均拦截，自动执行设置解析不调用模型。已查看 390 宽截图。

主要命令：

```sh
pnpm --filter @thesis-ledger/schemas exec vitest run test/strategy-optimization.test.ts
pnpm --filter @thesis-ledger/desktop exec vitest run test/experiment-budget.test.tsx
pnpm exec node scripts/test-unlimited-backtest-budget-postgres.mjs
PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright pnpm exec node apps/desktop/scripts/check-experiment-create-validation.cjs
```

均在主仓通过 RTK 执行。截图和浏览器回执为本机 `/tmp/experiment-create-validation-qa` 的可重建产物，未纳入 Git。

## 构建、门禁与部署

Schemas、Server、Desktop 构建通过，Desktop、Mobile 类型检查通过；本次预算相关源码与测试 ESLint、边界和 workspace 依赖门禁、`git diff --check` 通过，尺寸门禁保留 6 个既有警告。Mobile ESLint 单独存在 React Native Flow 依赖解析噪声，未将该输出声称为干净结果；本次仅修改 Mobile 说明文字，无原生工程变更。

构建期间工作区另一项行情缓存改动先后出现可选参数和联合类型错误。对 `market-request-coordinator.ts` 仅修正 `delay` 的可选 `signal` 传参；按 `recommend` skill 核对已安装 es-toolkit 1.51.0 声明和[官方文档](https://es-toolkit.dev/reference/promise/delay.html)，保持原有可取消延时行为。其他并发行情源码的类型错误由该工作区后续改动修正，未回退其实现；源码变化后最终 Server 构建通过。

在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行正式入口 `PATH=/Users/yzin/.volta/tools/image/node/26.13.0/bin:$PATH ./scripts/sync-code.sh thesis-ledger`，通过 RTK 调用，退出码 0。兼容性预检通过，Server 与 Backtest Worker 健康，镜像 ID 保持不变，未修改数据库结构或外部卷。快更位于容器可写层，不代表镜像已重建。

独立只读验证容器中的公共合同接受 `maxAiCalls: 0`，编译后的准入 SQL 含零值旁路，容器健康正常。首次检查猜测了错误的公共包目录，改用 Server 的实际包解析后核对；不将路径错误视为部署失败或行为证据。

## 最终一致性审查

通过。零值从公共边界到创建校验、表单、JSON 输入和原子准入一致；空输入与显式零值分开处理，累计统计和其他预算继续生效。默认值、正数范围、历史预算、幂等键和轮数没有改写。当前规格与创建校验规格已同步，任务全范围完成并归档，没有延期事项；未创建真实用户实验或触发模型，未提交或推送。

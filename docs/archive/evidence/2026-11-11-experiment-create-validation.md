# 实验创建前校验与错误反馈验收

## 诊断与实现

用户第二次截图显示 `510330.SH` 探索配置已经准备成功，冻结时间为 2026-11-11 22:53:25，但最后创建失败。读取 Server 在对应时间段的 HTTP 日志，存在成功的准备 POST，没有实验创建 POST。首张用户截图中的回测次数 200、输入 Token 100000000、输出 Token 20000000、时长 180000 秒，分别超过公共预算合同的 100、10000000、2000000、86400 上限。

浏览器重现确认：原表单只检查正数，公共客户端随后以 Zod 拒绝超限输入；英文校验错误又被通用文案替代。仅重新点击原按钮不能解决此输入问题。本次没有读取用户原浏览器的 React 内存，不将重现样本描述为截获原始请求。

公共预算数值边界集中到 `optimizationBudgetLimits`，原有整数、上下限和默认值保持不变。新建向导与旧实验面板共用 `ExperimentBudgetFields`，直接显示允许范围，输入控件同步设置 `min/max/step`，非法值显示字段错误。新建向导在调用 mutation 前使用公共预算 schema 校验，保留具体错误及原始输入；其他创建合同错误转换为中文业务原因，服务端和网络错误沿用原有投影。没有自动截断输入、扩大预算或改写历史记录。

## 本地验证

- `pnpm --filter @thesis-ledger/desktop exec vitest run test/experiment-budget.test.tsx test/market-experiment-recovery.ui.test.tsx test/strategy-optimization-form.test.ts`：3 个文件、25 项通过。覆盖截图超限组合、每个字段的最小/最大值、范围外数值、小数、非有限值、金额格式、错误转换、实际表单失败恢复与同意图重试。
- `pnpm --filter @thesis-ledger/schemas exec vitest run test/strategy-optimization.test.ts`：17 项通过。
- schemas 构建、Desktop 构建、相关文件 ESLint、边界门禁、workspace 依赖检查及 `git diff --check` 通过。
- 尺寸门禁退出 0；保留 6 个既有超限警告，没有有效全仓基线，不声明已清除存量债务。原创建页与旧面板均因预算字段抽取而缩小。Desktop 构建保留原有大分包提示。

## 浏览器验收

可重复入口：

```sh
PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright pnpm exec node apps/desktop/scripts/check-experiment-create-validation.cjs
```

在真实应用向导中，使用已有 `B4-Android-Authoring-Controlled v2` 和实际本地模拟成交设置接口；行情准备响应、创建失败与成功响应均由浏览器拦截。受控准备结果和实际创建请求均通过公共 schema 校验。

1440、1024、768、390 四宽均验证：

- 输入截图中的四项超限值，显示具体允许范围，创建 POST 数量为 0，输入原样保留。
- 修正到现有合同允许范围后，创建请求通过完整合同校验；不必重新准备相同实验区间。
- 首次受控返回 503，页面保留配置；再次提交的完整 body 与幂等键保持一致。
- 返回合法成功响应后导航至对应实验详情地址。
- 页面异常为 0，横向溢出为 0，没有未预期写请求。

已目视检查窄屏字段错误截图。临时产物在 `/tmp/experiment-create-validation-qa/`，包含 `invalid-<宽度>.png` 与 `results.json`。创建 POST 始终被拦截，真实实验创建数为 0，不调用 AI，也不为验收请求真实行情准备。

## 本地运行态

在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 使用 `./scripts/sync-code.sh thesis-ledger`，通过已安装 Node 26 可执行路径运行；未改变依赖、数据库结构或 Dockerfile，采用最小快更目标。退出 0，独立只读 Docker 状态显示 Server、Worker、DSA、PostgreSQL、Redis 均健康。脚本报告镜像 ID 保持不变，没有数据库结构或外部卷变化；快更不作为镜像更新或生产发布证据。桌面浏览器验收消费本机既有 Vite，已验证当前源码，不能据此声明安装版 Electron 已重新打包。

最终日志：`/tmp/experiment-create-sync.log`；浏览器结果：`/tmp/experiment-create-browser.log`。最终检查确认各字段边界、错误投影、原输入与幂等重试、模块依赖及合同默认值一致，未发现本次范围的未决问题。

## 验收边界

未提交或推送。Mobile 的独立预算 JSON 入口继续由公共合同校验，没有重设计；本次结论不覆盖真实付费实验执行。该修复允许合法配置发出创建请求，不能把浏览器拦截的成功响应声明为服务端已创建用户实验。

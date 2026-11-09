# 已保存策略回测入口验收

日期：2026-11-07。对应[规格](../../specs/2026-11-07-saved-strategy-backtest.md)和[任务](../tasks/2026-11-07-saved-strategy-backtest.md)。

## 行为与覆盖

普通股票／ETF 回测自动读取已保存策略与所选区间的市场规则，复用策略佣金、最低佣金、滑点和成交方式。来源规则按日期拆段；未知费项、覆盖缺口、冲突和未来来源时钟明确阻断；极小非零最低费用保持十进制原值。生成配置标记为当前研究配置，保留来源引用及规则版本。原有准备、冻结、预检、后台连续提交和再次运行的冻结配置保持原合同。

Desktop 默认展示日期、资金、价格口径和自动设置状态，底部“开始回测”直接进入现有后台链。高级历史时点、预热和公司行动选项收在可展开的独立分组中，当前历史口径及准备完成时冻结的语义直接可见。使用 TanStack Query 区分版本、日期、币种及复权口径；迟到响应不能替代当前配置。自动读取不把表单标记为用户已编辑，普通取消可直接关闭。

API 新增 `POST /api/v1/backtests/run-config/execution-model`，由 `StrategyIdentityGuard` 校验版本所有权，并登记为 `marketRead`。Backtest 原已依赖 DSA Module，本次不改变依赖方向，模型组装仍归 Backtest 所有；模块边界检查通过。Mobile 和基金净值专用入口的已有契约未变。

## 自动验证

| 范围                                | 命令                                                                                                                                                                                                                                      | 结果                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 解析契约                            | `pnpm --filter @thesis-ledger/schemas exec vitest run test/backtest-model-resolution.test.ts`                                                                                                                                             | 2 项通过                                                            |
| Server 模型、原准备链、所有权和预算 | `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/saved-strategy-model.test.ts test/backtest/backtest-run-preparation.test.ts test/backtest/strategy-identity-guard.test.ts test/platform/api-rate-limit-policy.test.ts` | 64 项通过，包含纳秒级未来来源拒绝及全部 Controller 操作登记检查     |
| Desktop 自动准备、原准备与界面合同  | `pnpm --filter @thesis-ledger/desktop exec vitest run test/saved-strategy-backtest.ui.test.tsx src/features/strategy/strategy.ui.test.tsx test/backtest-preparation.test.tsx`                                                             | 最终输入 28 项通过                                                  |
| API Client 解析及原准备传输         | `pnpm --filter @thesis-ledger/api-client exec vitest run test/backtest-model-resolution.test.ts test/backtest-preparation-transport.test.ts`                                                                                              | 6 项通过                                                            |
| 共享契约整包                        | `pnpm --filter @thesis-ledger/schemas exec vitest run --maxWorkers=2`                                                                                                                                                                     | 1489 项通过、3 项按环境跳过                                         |
| API Client 整包                     | `pnpm --filter @thesis-ledger/api-client exec vitest run --maxWorkers=2`                                                                                                                                                                  | 211 项通过                                                          |
| Desktop 整包                        | `pnpm --filter @thesis-ledger/desktop exec vitest run --maxWorkers=2`                                                                                                                                                                     | 最终共享输入 264 文件、1684 项全部通过                              |
| 构建                                | `pnpm --filter @thesis-ledger/schemas build`、`pnpm --filter @thesis-ledger/api-client build`、`pnpm --filter @thesis-ledger/server build`、`pnpm --filter @thesis-ledger/desktop build`                                                  | 均通过；最终前端布局变更后已重跑 Desktop 构建，保留既有大包体积提示 |
| 静态检查                            | 修改文件 ESLint、`scripts/check-boundaries.mjs`、新文件格式及文档链接、`git diff --check`                                                                                                                                                 | 最终输入通过                                                        |

首次新增 UI 测试遇到 jsdom 下文件 URL 和测试容器缺少 Toast／数据路由 Provider，已修正测试环境后通过。Server 首轮构建发现策略解码的执行与表达式类型为 `unknown`，已用执行配置 Schema 显式验证，并将纯模型输入收敛到成本与标的。原准备 HTTP 测试曾因向同一 Controller 添加新依赖而初始化失败；解析接口改用独立 Controller 后，原 16 项准备测试通过，原接口依赖保持不变。

## 实际浏览器

本机 Edge／Playwright，开发服务器 `http://127.0.0.1:5173`，在真实策略库的“MA20趋势突破策略”中进入回测。1440、1024、768、390 × 1000，每宽检查加载、来源阻断、重试就绪、高级选项展开、日期切换、受控提交及取消，共 28 场景通过。解析和提交 POST 均用受控响应，真实 GET 仅用于读取；4 次受控提交使用当前日期、当前版本和匹配的完整模型。真实业务写请求 0，页面脚本异常 0，页面无横向溢出，弹窗和固定操作栏保持视口内。

已目视核对桌面、平板和窄屏截图。长内容区改用按内容高度排列的网格，避免自动表单加入后顶部摘要被压缩，溢出通过内部滚动承接。失败原因使用独立段落与重试按钮。浏览器脚本曾将开发 StrictMode 的两次初始读取误当成单次，并以精确文本匹配包含子按钮的说明容器；修正受控请求分组及说明段落后，完整矩阵通过，未放宽校验。

## 正式更新与实际来源边界

- 执行目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`；入口：`./scripts/sync-code.sh thesis-ledger`；使用默认参数，退出码 0。兼容性预检、宿主机构建、Server 与 Backtest Worker 同步、重启及健康检查通过；未更新 DSA、数据库结构或外部卷。
- 脚本确认镜像保持 `sha256:744b2fdee55705ffe8fdd2ca62f0ca5c7f4a8cbe6ded00f27e0c0125f235141c`。这是容器可写层快更，重建后会消失，不代表镜像更新或正式发布。其后的前端文案分段、滚动布局及高级选项变更只影响本机前端，已独立构建和实际浏览验证。
- 实际接口以已保存版本、`600519.SH`、CNY、不复权读取 `2025-11-07～2026-11-07` 和 `2024-01-02～2024-03-29` 两个区间，均返回 HTTP 201 和 `blocked`，说明为“所选区间的市场交易规则尚未齐备，请更新数据或调整回测日期后重试。”来源当前没有完整规则，因此未验证这两个区间的真实回测成功结果。
- 实际来源读取仅调用现有规则事实接口，没有创建真实回测任务、启用来源或调用模型。模型组装成功及提交路径由受控样本证明；实际来源阻断由真实接口证明，两者分别成立。

本机日志 `/tmp/saved-strategy-*.log`；真实接口结果 `/tmp/saved-strategy-runtime-results.json`；浏览器脚本 `/tmp/saved-strategy-browser.cjs`；结果及截图 `/tmp/saved-strategy-browser-qa/`。保留共享工作区其他修改，未提交或推送。

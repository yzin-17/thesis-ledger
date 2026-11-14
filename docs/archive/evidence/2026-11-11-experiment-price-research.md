# AI 实验统一研究规则验证记录

验证日期：2026-11-12。合同见[规格](../../specs/2026-11-11-experiment-price-research.md)，完成范围见[任务](../tasks/2026-11-11-experiment-price-research.md)。

## 实现与证据对应

| 断言 | 实现所有权 | 验证 |
| --- | --- | --- |
| 新实验固定后复权研究并冻结原价参考 | Schemas 准备合同、Backtest 输入冻结与快照完备性 | 合同、快照、价格对测试；实际 Worker |
| 纯指标基线仍为候选预留原价参考 | Backtest 的显式 `priceResearchReference: freeze` | 纯状态基线与新增绝对价格条件候选的数据指纹一致，快照离线重放 |
| 种子、候选、正式采纳均支持 V3 | StrategyOptimization 创建、发现、候选和采纳 | 新旧种子与克隆、候选分流、V2/V3 采纳测试 |
| 旧版本必须确认保存新版本 | Desktop 复用预览组件、Mobile 独立确认入口 | Desktop 真实组件测试；Mobile 浏览器受控保存失败、重试、新 ID 使用 |
| 历史记录与旧幂等恢复保持原语义 | 按冻结协议选择生成路径；创建先找回既有记录 | 历史 V2 种子和克隆、缺少新协议的新建拒绝、旧幂等恢复测试 |
| 页面移除口径选择并自动配置 | Desktop 两个创建入口、Mobile 准备输入 | 四宽受控浏览器、更新后真实页面只读检查 |

## 定向验证

在主仓执行，命令均经 RTK；测试输出仅保留统计及失败详情。

- Schemas：`pnpm --filter @thesis-ledger/schemas exec vitest run test/backtest-price-research.test.ts test/backtest-run-preparation-v3.test.ts test/strategy-optimization.test.ts`，3 文件、34 测试通过。
- Server：`experiment-price-research`、`optimization-model-resolution`、`strategy-optimization-preparation-http`、`continuous-execution`、`price-research-pair`、`price-research-snapshot` 共 6 文件、30 测试通过；`strategy-optimization-discovery`、`strategy-optimization-parameters` 共 23 测试通过；最终 `strategy-optimization-adoption` 3 测试通过。
- Desktop：`optimization-preparation`、`optimization-execution-model.ui`、`market-experiment-recovery.ui`、`experiment-budget` 共 4 文件、24 测试通过，包括锁定旧 ID 的转换保存与后续采用新 ID。
- `pnpm exec node scripts/test-experiment-price-research-runtime.mjs`：维护入口创建并清理隔离 PostgreSQL、Redis，真实 Nest HTTP、BullMQ、编译后 Worker 运行通过。基线为纯状态规则和固定金额，候选新增原价阈值与固定参考份数；实际冻结数据指纹一致，参考份数为 100，离线回放一致，隔离账本和持仓没有新增。
- 同一隔离测试调用实验准备入口、发现执行设置解析和实验持久化创建，确认研究空间标识与 Schema V3 种子；处理回调为受控空实现，未调用 AI。
- Schemas、API Client、Server、Desktop 构建通过，Server、Desktop、Mobile 类型检查通过；受影响源码 ESLint 通过。边界、workspace 依赖、无障碍静态检查及 `git diff --check` 通过。文件尺寸门禁保留 6 个既有警告，实验大 Service 已提取创建编排并缩小。

## 浏览器验收

使用 Playwright 与本机 Edge，无真实策略保存或实验创建。宽度均为 1440、1024、768、390，检查横向溢出、控件边界、页面错误及请求内容。

| 入口 | 命令 | 结果 |
| --- | --- | --- |
| 自动成交设置与行情准备失败 | `apps/desktop/scripts/check-experiment-settings.cjs` | 自动设置失败可重试；无手填模型；固定后复权及双输入标识正确；目标、区间改变后更新设置 |
| 实验创建与原有预算行为 | `apps/desktop/scripts/check-experiment-create-validation.cjs` | 受控准备和创建，预算错误保留输入，0 不限制，失败同一提交重试，成功导航 |
| Mobile 研究确认 | `apps/desktop/scripts/check-mobile-experiment-research.cjs` | 实际 Hook 和组件；先预览再保存，保存失败可重试，采用新 ID，模型受阻可重试 |
| 更新后真实新建页 | `apps/desktop/scripts/check-experiment-settings.cjs --live-readonly` | 读取既有 V3 正式策略，参数授权与自动设置可用；无口径切换，无业务写入 |

运行环境变量：`PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright`。Desktop 使用 `http://localhost:5173`；Mobile 受控入口使用 `pnpm --filter @thesis-ledger/desktop exec vite --config test/price-research.vite.config.mjs` 的 5187 端口。

截图与回执保存在本机 `/tmp/experiment-settings-qa`、`/tmp/experiment-create-validation-qa`、`/tmp/mobile-experiment-research-qa`，未作为源码跟踪。已查看 390 宽真实页面和受控组件截图。Mobile 使用 React Native Web 映射，本次没有原生工程变更，不将本记录解释为设备端编译或真机验收。

## 部署与独立运行态检查

执行目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`。

正式入口：`PATH=/Users/yzin/.volta/tools/image/node/26.13.0/bin:$PATH ./scripts/sync-code.sh thesis-ledger`，通过 RTK 执行，目标仅 `thesis-ledger`，退出码 0。快更兼容性预检与应用构建通过，Server 与 Backtest Worker 更新后健康；镜像 ID 保持不变，未修改数据库结构或外部卷。快更位于容器可写层，容器重建后需按正式入口重新更新。

独立只读检查确认 Server 编译产物包含研究空间标识与 V3 采纳门禁，Worker 编译产物包含额外原价冻结和回放规则；Docker 健康状态正常。更新后真实页面与本地 Server 的参数读取、自动执行设置解析通过上述四宽检查。未用容器健康代替行为验收。

最初一次快更在构建阶段被测试 Mock 的零参数类型错误阻断，未替换运行服务；改为显式函数类型后构建及最终快更通过。初次隔离测试因样本候选预热预算为 0 不满足窗口需求而失败，改为正式默认 60 后通过，未放宽门禁。

## 最终一致性审查

结论：通过。逐项核对新建、准备、种子生成、候选持久化、正式采纳、冻结回放和客户端采用新 ID 的连接边界。补充 V3 采纳测试发现仍有 V2 专属门禁，已改为同时验证受支持版本与元数据一致，V2/V3 回归均通过。历史路径仍按原种子、协议与提示版本执行；新建完整性检查位于幂等找回之后。

当前 Spec 与既有执行设置 Spec 已同步，Task 全范围完成并归档，仍有效的 Spec 留在活动目录。没有新增延期事项；未改写历史业务数据、路由策略或数据库结构，未触发真实 AI 或用户实验，未提交或推送。既有工作区其他变更保持原状。

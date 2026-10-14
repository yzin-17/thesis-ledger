# 停复牌结果披露本地交付证据

日期：2026-10-06。对应 [主备数据源任务 P5.3b.2](../../archive/tasks/2026-10-06-historical-rules-primary-backup.md) 和 [方案 AC2／AC4／AC5](../../specs/2026-10-06-historical-rules-primary-backup.md)。

## 交付结论

P5.3b.2 已完成本地交付；结合 [P5.3a 冻结接缝](2026-10-06-trading-status-freeze-seam.md) 与 [P5.3b.1 创建／执行](2026-10-06-trading-status-execution.md)，P5.3b 和 P5.3 的本地实现完成。真实价格、目标运行态、无网络重放与实际浏览器验收继续由 P5.4 负责，不以本证据代替。

现有结果页接入冻结停复牌披露组件，复用已安装 Alert、现有说明区域和统一日期格式。实际公告样本显示 `000995.SZ` 的 2023-08-17 停牌、08-18 公告披露可交易，08-16 与 08-19～21 为未知。相邻同状态记录合并为区间；只压缩合同已返回的连续记录，不从公告链接、周末或缺价格推断正常。

页面显示实际公告链接、上市公司公告性质、发布日期、采集时间、来源与版本，保留整窗回退及未纳入真实约束的原因。未知日期沿用当前研究假设；公告披露可交易仍受其他执行规则约束，历史首次可见时钟未核验的研究边界明确显示。无字段、无效合同及旧版本结果不生成新状态声明。

诊断沿用格式2，以可选字段保存逐日状态、已知日期的文档引用、实际来源、版本与原因；复制摘要和现有诊断分组同步消费。投影使用明确白名单，不序列化请求、路由或 Provider 配置，所有自由文本及 URL 调用既有脱敏函数。基准成本身份与原有诊断字段保留；旧诊断没有新字段或声明。

## 验证记录

| 检查 | 命令／输入范围 | 结果与边界 |
| --- | --- | --- |
| 定向消费 | `pnpm --filter @thesis-ledger/desktop exec vitest run test/backtest-trading-status-disclosure.test.tsx test/backtest-public-fees-disclosure.test.tsx test/strategy-backtest-diagnostics.test.tsx --reporter=dot` | 3文件／20项通过；其中新增停复牌9项，实际公告响应样本与 React 静态渲染 |
| Desktop 包级 | `pnpm --filter @thesis-ledger/desktop test --reporter=dot` | 107文件／715项通过，含既有收费、基准消费、诊断、封存读取限制及图表回归 |
| 类型／构建 | Desktop `typecheck`、`build` | 通过；保留既有 Vite 大包告警，不改变分包规则 |
| 局部代码门禁 | 本叶6份源码／测试 ESLint `--max-warnings=0`、Prettier；`check-boundaries.mjs`、`check-workspace-dependencies.mjs`、`check-file-size-guardrails.mjs` | 全部退出0；9项其他文件的既有尺寸告警保留，未修改阈值或 ignore |
| 文档与差异 | 本叶文件的 `git diff --check`、本地 Markdown 链接和格式 | 通过 |

新增断言覆盖已知日期／未知区间、全窗未知、整窗回退、未纳入、旧结果、实际结果说明挂接、非网页协议不创建链接、诊断字段白名单、带凭证 URL／自由文本脱敏及基准成本身份保留。测试不联网拉取状态，不重新计算收益或改写完整性。

使用项目锁定 shadcn CLI 检查 `components.json`、Base UI／Tailwind v4、已安装组件与 [Alert 官方组合说明](https://ui.shadcn.com/docs/components/base/alert)，复用本地 Alert 实现，没有安装或覆盖组件。组件66行、领域投影63行、诊断模型358行、诊断组件234行、测试189行，均在适用尺寸范围内。日期区间合并属于停复牌展示语义，留在该能力的领域 helper，没有增加通用工具层。

## 最终一致性审查

- 通过，范围为 AC2／AC4／AC5 的本地冻结、执行及结果消费接缝。Server 实际可选合同与 Desktop 读取一致；unknown、无源、旧字段缺省及历史可见时钟说明没有语义漂移，原撮合器和基准版本路径保留。
- 实际组件接入、诊断投影、包级回归与构建覆盖同一稳定工作区；Schema／Server 没有本轮修改，沿用 P5.3b.1 的724／2473项及构建证据，不重复运行未变输入的高成本检查。
- P5.4 的真实目标／浏览器和 P6 扩展保持未完成；当前义务未移到 TODO 或归档。另一对话正在只读调查股票覆盖，不占目标更新窗口，本叶没有向其发送消息或修改其文件。
- 开始时主仓646个dirty路径，收口检查649个，所有并行WIP保留。本轮不改变 Server、DSA、Schema、配置、目标 Docker／数据库或 Vite 进程，没有提交或推送。

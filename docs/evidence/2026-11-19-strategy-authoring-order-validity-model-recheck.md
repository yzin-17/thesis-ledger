# 已有买单有效期短输出的真实模型对照

2026-11-19，`day` 和 `two-bars` 首次业务生成均通过。短输出只指向 `buy` 的有效期。两份组装后的完整定义、确认差异、隔离保存重读、冻结 Worker 完整结果和中文回读均与同方向的 v5 合格回执一致。实发一次格式探针、两次业务生成，各次只有一次出站。结论限于这两个方向及本次模型配置。[离线试点](2026-11-19-strategy-authoring-order-validity-pilot.md) · [设计评审](../reviews/2026-11-18-strategy-generation-redesign.md)

## 首次响应与成本

沿用 lmstudio 的 `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m`、原生流式输出、8,192 输出 token 上限及原编写期限。私有格式探针使用独立的模板名、需求 ID 与五根有效期。两个业务请求分别使用原草稿修订、完整基线、自然语言意图和章节授权，实际出站 body 的 SHA-256 与离线试点预先记录的两个请求逐份相同。业务响应均在 `stop` 结束，原始文本可解析。模型两次均给出 `change=validity`、`templateId=buy`、`requirementId=rules`。

| 请求 | 首次返回的新期限 | 实际输入／输出 tokens | 首段可见正文 | 本次总耗时 | 历史 v5 输入／输出 tokens | 历史 v5 首段正文 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 格式探针 | 探针要求的 5 根 | 55／312 | 5.55 秒 | 6.05 秒 | — | — |
| day | `{"kind":"DAY"}` | 679／1,630 | 28.86 秒 | 29.76 秒 | 5,599／4,824 | 65.44 秒 |
| two-bars | `{"kind":"bars","bars":2}` | 674／2,549 | 44.86 秒 | 45.62 秒 | 5,779／4,527 | 75.74 秒 |

本次总耗时从调用前计至响应流结束。两次业务生成合计输入 1,353、输出 4,179 tokens；相应历史 v5 为 11,378、9,351，输入少 88.1%，输出少 55.3%。输出用量含模型推理，两个方向分别报告 1,515 和 2,459 个推理 tokens。历史成功回执记录了首段正文耗时；此处只比较两边都有的时间指标。历史对照与本轮发生在不同时间，每个方向本轮只有一次业务生成。

## 隔离保存与冻结回放

两侧都通过原范围、修订、委托顺序和局部修改校验后，才创建两个隔离策略版本。唯一的定义差异均在 `execution.orders.0.validity`。普通退出继续当天有效，止损继续在买单每次成交后建立、持续到持仓结束。模型响应、组装定义和实际成交可逐份核对。

| 场景 | 隔离策略版本 | 冻结行情下的买入成交 | Worker 结果校验值 |
| --- | --- | --- | --- |
| day | `411a3ea8-8275-4303-a286-4e89c7da917f` | 5 月 19 日 100 份，价格 9.5；第二日无成交 | `633620e5cabf5339` |
| two-bars | `9a8becea-fbbf-4c6e-95d1-18252ca32bcf` | 5 月 19 日和 20 日各 100 份，价格均为 9.5 | `0b74741371f64882` |

保存走 `StrategyCreationService.createInTransaction`，数据库重读完整定义。沿用原压力样本的冻结行情和撮合假设，每个方向运行冻结 Worker 两次，完整结果一致且与历史回执深度相等；执行明细与中文回读也相等。开发库 Provider 行在实测前后剔除凭证后深度相等，隔离 PostgreSQL 容器已清理。[隔离验收入口](../../apps/server/test/strategy-authoring/order-validity-pilot-live.integration.test.ts)

## 命令与回执

以下是本次在相邻 infra 仓库执行的命令，已用完本次授权。主仓私有目录 `var/acceptance/order-validity-pilot-live-20261119-133724/` 中，三个 `*-request.json` 和 `*-response.json` 分别记录真实请求体、首答文本、实际模型、用量和时间；`pair.json` 记录两个首次判定，`*-check.json` 和 `*-replay.json` 保存定义差异、版本及冻结结果。

```sh
rtk proxy env npm_config_registry=https://registry.npmmirror.com BACKTEST_PLAN_ENTRY=authoring-modification BACKTEST_PLAN_SCENARIO=order-validity-pilot node scripts/infra.mjs locked --idle -- node ../thesis-ledger/scripts/local-runtime/run-backtest-trade-plan-acceptance.mjs ../thesis-ledger/var/acceptance/order-validity-pilot-live-20261119-133724
```

真实集成用例通过，Server 类型检查、测试文件 ESLint 和启动脚本语法检查通过。本轮改动仅在验收入口、测试和文档。建议将此短合同作为已有买单有效期修改的正式接入候选；其他修改类型及生产路由另行评估。正式 v5 继续沿用，T04d 的 24／24 独立计数。ATR 未重跑，未部署、提交或推送。

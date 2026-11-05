# 派生周期指标跨仓合同与计算证据

## 完成范围

2026-10-04 父对话在主仓及实际 DSA 原仓串行完成 T1.3 与 T4 的 DSA 计算责任。主仓 HEAD 为 `514abeebfe57bac0c16271439d8b777ff3b02a9f`，DSA HEAD 为 `d40549602d187da7bdd0e8bebb59d2a0fc271919`；本次源码仍为未提交修改。原 Spec/Task 为[行情周期规格](../../specs/2026-09-16-market-chart-period-aggregation.md)与[任务清单](../../archive/tasks/2026-09-16-market-chart-period-aggregation.md)。

新增独立 `market-period-indicator-v1` 请求与能力合同。四周期计算绑定完整聚合摘要、实际计算点摘要和最终输入指纹；DSA 重算点摘要及最终绑定，继续调用原有 pandas 指标公式。能力端点独立于 Data V3 握手，明确 STOCK/ETF、1～3650 点、参数 2～200 及 MA/MACD/RSI 预热规则。原始来源 identity/timeframes 仍为 1m/1d。

T4 的输入是已经聚合的周期序列，DSA 不进行聚合、不访问 Provider、不补造预热数据。月线 MA5 对受控月线实际计算，年度一个点的全部指标返回空值。Server 对实际历史覆盖、显示窗口和可得性的装配仍属于 T3；公开派生请求当前继续返回 T1.2 的结构化拒绝。因此 T1.3/T4 完成不代表 AC4 的完整产品路径或全部行情 AC 已通过。

## 共享输入与复现

主仓 `packages/schemas/fixtures/` 与 DSA `tests/fixtures/` 各保存独立副本，DSA 测试不依赖相邻仓库路径。双方逐字节一致：

| 夹具                         | SHA-256                                                            |
| ---------------------------- | ------------------------------------------------------------------ |
| 四周期实际聚合编码及指标请求 | `1e695091d17f4a8d50913572b8979eb63a391dd820f4e43e828f04138fee4cda` |
| 独立计算能力                 | `babaf6ad844242144e50ac9120defc4ac88d34228decbb7dbf52230be155bf06` |

`pnpm exec tsx scripts/print-market-period-indicator-fixture.mjs` 通过既有 Domain 纯函数生成并输出夹具，结果与文件完全一致。四组计算点数分别为 53、53、12、1。夹具使用受控工作日日历和合成价格，不证明真实交易所日历、历史覆盖或来源可用性。

## 本地验证

| 范围                               | 命令或检查                                                                        | 最终结果                              |
| ---------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------- |
| 新 Schema、DSA Client 传输与旧调用 | 三文件定向 Vitest                                                                 | 35 项通过                             |
| Schema 全包                        | Schema 包级 Vitest                                                                | 54 文件、635 项通过                   |
| DSA 真实计算、HTTP 拒绝和旧合同    | `.venv/bin/python -m pytest`，新增周期测试及旧指标、Market V3、合同四文件         | 58 项通过、7 个既有警告               |
| API Client 全包                    | `pnpm --filter @thesis-ledger/api-client test`                                    | 11 文件、68 项通过                    |
| 消费端                             | Server/API Client/Desktop 类型检查                                                | 通过                                  |
| Python                             | 三个修改文件 `py_compile` 与 flake8 `E9,F63,F7,F82`                               | 通过                                  |
| 工程门禁                           | 新增/受影响代码 lint、格式、boundaries、文件尺寸 ratchet、两仓 `git diff --check` | 通过；尺寸门禁保留 9 个未增长的旧告警 |

生成器在现有 ESLint 忽略范围内，未将其忽略提示写成 lint 通过证据；其实际执行及 Prettier 检查通过。未运行 DSA 全后端门禁、远端 CI 或原生设备验证。

测试最初发现响应可使用等价的 UTC 偏移时间字符串，断言改为按时刻比较，与现有 Server 投影行为一致，没有改变公式或时间输出。生成器的 JSON 格式差异通过统一输入缩进及格式配置修复，最终字节与内容均可复现。

本地日志保存在 `/tmp/market-period-indicator-main-directed.log`、`/tmp/market-period-indicator-schemas-all.log`、`/tmp/market-period-indicator-dsa-regression.log`、`/tmp/market-period-indicator-api-regression.log`、`/tmp/market-period-indicator-consumer-types.log` 等临时文件中；此处记录范围与统计，临时日志不作为永久交付文件。

## 目标开发运行态

稳定源码通过 infra 官方 `./scripts/sync-code.sh all` 同步，兼容性预检、构建及 DSA/Server/Worker 健康检查通过。未改变依赖清单、数据库结构、外部卷或镜像；DSA 镜像仍为 `sha256:de21d3fc8ae44c9a15c5f35abc97de74569ccd614aa33b5a3b542faa8fb6b351`，Server/Worker 仍为 `sha256:27dfa6a8aa364abf0eacf21a793a2ecfb4f95a579d0285bd7aabcbb143744426`。这是可写层快更，容器重建会恢复镜像代码，不是镜像发布证据。

目标 DSA 容器内通过实际 HTTP 执行 10 项检查：能力端点认证拒绝与共享声明匹配，四周期真实计算与响应输入指纹匹配，四组篡改输入均返回 422，年度预热输出为空。认证密钥仅在容器进程内部从环境读取，没有写入命令参数或日志。Provider 请求和业务数据写入均为零。日志为 `/tmp/market-period-indicator-target-readonly.log`。

同步后复用既有标记账户进行 Journal 保护性读取及纯分析：候选 3 个、历史快照 2 份、旧快照仍 STALE、收益 4.6、反事实 -4.4、周期统计 1 Cycle/2 Slice；两个受保护 Ledger 哈希及验收账户分析前后哈希未变。没有再次创建账户或保存快照。日志为 `/tmp/market-period-indicator-journal-protection.log`。

## 剩余依赖

T3 需从实际 calendar/Session fact、基础日线覆盖及价格口径装配派生窗口、缓存和公开成功响应；T5 随后消费真实能力并完成界面与分页隔离。T6/G1/P1/R1 的真实来源、浏览器、设备及最终一致性检查继续开放。DSA provided-points 计算声明不能代替这些门禁。

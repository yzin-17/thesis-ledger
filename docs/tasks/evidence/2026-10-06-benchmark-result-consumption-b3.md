# B3：基准净收益与逐指标可用性本地交付

> 日期：2026-10-06
> 对应任务：[B3实施记录](../../archive/tasks/2026-10-06-historical-rules-primary-backup.md#benchmark-net-return-tasks)
> 结论：B3本地消费通过，B4目标运行与真实页面验收继续保留。

## 实际原因与范围

开始时主仓623条、DSA56条、infra49条未提交记录保留。已与获用户授权协调的“历史市场规则来源核验”说明共享写集；其P5进度和目标窗口归属继续保留。

只读标准API `GET /api/v1/backtests/runs/652ba051-a4c5-493d-81e6-2cdbe3c090f0` 确认：持久化任务succeeded、结果partial；策略累计净收益、回撤、交易及其余策略指标均available，基准净收益为 `BENCHMARK_COST_MODEL_UNSUPPORTED`、净收益差为 `BENCHMARK_RETURN_UNAVAILABLE`。历史首次可见时钟未验证仅出现在warning。初次探测使用不存在的jobs路径返回404，校正为已有runs入口后完成读取；不将其判为服务故障。

因此本轮只完善消费，不改Server完整性规则、费用计算或旧结果。B2已经提供新版本基准净收益；新目标结果仍由B4生成。

## 用户可见行为

- V3概览使用“策略净收益”，在现有次要指标容器增加“基准净收益”和“净收益差”；沿用原四个页签与图表、订单、诊断布局。
- 收益差只消费服务端指标，并要求兼容报告通过严格合同读取、已记录双方指纹无矛盾、成本类型可用且双方收益有效。口径不兼容／未核实、报告不完整、收益缺失时显示具体原因，不在客户端重新计算或补零；有效零收益正常显示。
- partial说明按实际缺口定位，旧基准不可用不会隐藏有效收益、回撤、期末资产或成交。图表保留已返回时点，覆盖仍以冻结证据为准；具体受限项目指向指标和诊断，避免把基准缺口描述为权益曲线未核实。
- 执行模型成本说明为“按各自成交日期、方向和金额逐笔计费”。旧unsupported明确指向该冻结版本；首末收盘买入／清算及收益差定义只在已记录的对应基准约定存在时展示。
- 数据与假设使用既有中文完整性标签。研究说明不在客户端制造partial，也不把历史partial升级为complete。

诊断导出升级格式2，增加基准原始指标、兼容状态、缺失／不同字段及成本版本／指纹。沿用字段白名单和既有脱敏，不导出整个请求、Provider配置或任意兼容报告附加字段。格式1历史文件和持久结果不修改。

## 实施与验证

按照项目锁定版本在Desktop运行 `pnpm exec shadcn info --json` 和 `pnpm exec shadcn docs alert card table badge`，核对Base UI／Tailwind v4／现有别名与组件。已读取[官方Alert文档](https://ui.shadcn.com/docs/components/base/alert)及CLI返回的四项官方示例；网页工具不能读取源码示例时，以只读请求取得示例并提取所需组合。没有安装、覆盖组件、修改依赖或新增CSS。

所有本地命令均使用 `rtk proxy`。

| 检查 | 范围 | 实际结果 |
| --- | --- | --- |
| Desktop定向 | 新benchmark-availability、diagnostics、detail、strategy.ui／strategy.v2五文件 | 最后48项通过；新文件15项覆盖状态、零值、版本说明及安全导出 |
| 图表回归 | 最终包级包含既有chart模型11项 | 通过；保留原冻结证据覆盖断言，不按日期间隔猜缺口 |
| Server收费Snapshot | `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/public-fees-snapshot-v3.test.ts` | 6项通过；固定供应商快照、未验证时钟warning与真实complete同时存在 |
| Desktop包级 | `pnpm --filter @thesis-ledger/desktop test` | 最终106文件706项通过，退出0 |
| Desktop类型／构建 | `typecheck`；最终 `build` 包含类型检查与Vite | 通过；保留大于500kB的既有分包告警，未放宽阈值 |
| 局部Lint／格式 | 本次9份源码／测试，及最终变更的价格／图表／新测试复验 | 退出0 |
| 仓库门禁 | `check-boundaries.mjs`／`check-file-size-guardrails.mjs` | 退出0，尺寸门禁保留9项其他文件存量告警 |

初轮组件45项通过，但展示模型返回展开Record后丢失索引签名导致类型检查失败；改为明确的两个基准指标后通过。最终图表措辞调整时，既有覆盖说明断言失败；保留其必要冻结证据说明并修正措辞，最终包级通过。局部新增代码的格式告警也已通过原生patch修正并复验。

测试包含新价格披露的严格V3解析；旧基准不可用仍展示策略指标及成交；错误／未核实／不完整或矛盾兼容报告不能显示已有比较数值；双方收益缺失与有效零值分别验证；渲染不修改原结果。安全导出回归确认额外authorization／apiKey不会进入格式2。

## 写集与稳定基线

主要写集为Desktop结果详情、价格说明、诊断、图表文案及其模型；新增 `strategy-backtest-result-availability.model.ts` 与独立UI／模型测试。Server只增加既有收费Snapshot测试的断言；不修改生产完整性判定。

验证后生产源码SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| 可用性展示模型，94行 | `429d9818ca0d850ea808762fcd7e27b0f8ccab372fc484df3f702b431f73ebaf` |
| 详情组件，378行 | `8b8ab9565b621078a0fcdba7cb9e17563c1e47aab5f0908d89022abdc465a947` |
| 价格说明，88行 | `feb7cdbdc766eab1282e51c60d7ee64d94da034b04a700c2d9733e741499cd76` |
| 诊断模型，345行 | `709b43e1cc9fd360abfda1e102d26836cdfcb4a323336d45335e83e52b5001a4` |
| 诊断组件，231行 | `5b98de487d770efa741b9e01d0ec267452c1e24aca900e72936807b2cdf787d4` |
| 图表模型，215行 | `1a0d280276df2a614ca95207ed78b7fcef66103d77efc2a021001694459c35e4` |

B2成本入口保持 `5011ba8c77dd3d046ca8824a89e92b480221e1e5994b450f96e9c2cf2724296c`，Server基准投影保持 `8308b86b90b2970e3e4ece12aae21561c6a988a63721f2074a879889190ba1a3`。样式、业务调用、策略／撮合、Shared Schema与费用源均未由B3改变。

## 交付审查与下一步

B3局部交付通过，B1～B3已完成本地合同、计算和消费。B4仍须在无冲突目标窗口走正式最小更新入口，创建独立600000新结果，核对基准自身资金／费用、固定快照重放和真实浏览器。SSR不是浏览器验收，本地构建不是目标运行态证明。

本轮未更新目标Docker、未创建新回测、未修改真实路由或持久结果，未提交／推送；原任务继续保留，当前义务未移入TODO或归档。

# S05 来源时钟与生产预检、冻结写入门禁

## 完成范围

本轮完成 `S05-reconstruction-source-times`、`S05-reconstruction-preflight-guard` 和 `S05-reconstruction-freeze-guard`，属于实质进展；S05、重建时间和消费父项继续开放。

来源时钟核验位于 Market。内容绑定之后，归档的价格/可见事实不得晚于真实来源观察，Server 实际抓取不得早于来源观察，逐 Bar 使用的观察不得晚于该 Bar 的可见时间。传输导致的稍晚抓取保留，未把抓取和观察强制相等，也未改写原时间。输出仅为 `source-times-bound`。

联合生产预检通过 Market 导出的实际 repository 读取只读清单和不可变归档，再核对来源时钟。非空但无证据的引用、原文撤销、归档缺失/失败、迟观察和只通过必要条件均不能返回 ready。仅完成必要条件时返回 `DATA_UNAVAILABLE`，明确缺少 `historicalDecisionWindow`，严格协议保留。

新 V3 Snapshot 构建器注入同一 repository，并在 `startBuild` 和 Artifact 写入之前消费相同门禁。缺真实证据返回带稳定 `code` 和 `missingFields` 的错误；直接调用冻结入口也不能依靠非空引用写入严格 Snapshot。固定快照保持现有冻结/重放行为。

## 历史资格的剩余边界

| 阶段 | 当前结果 | 严格 PIT 资格 |
| --- | --- | --- |
| 清单与输入引用 | `bound` | 尚未取得 |
| 原文和实际归档内容 | `archives-bound` | 尚未取得 |
| 来源观察与抓取时钟 | `source-times-bound` | 尚未取得 |
| 独立历史决策窗口/来源版本核验 | 未完成 | 继续阻断 |

研究时晚可见的旧 Bar 可能满足来源时钟必要条件，仍不能被解释为原始历史可见性。对应反例已验证；最终独立窗口合同和实际来源准入仍须实施，不能靠修改现有时间字段绕过。

最终合格证据的 Snapshot 封存格式、完整原文/归档冻结和离线重验继续开放。本轮只保护新写入，现有 finalized V3 严格快照的直接重放尚未增加最终历史证据门禁；V2 路径保持自身版本语义。

## 本地验证

- 新增 26 项：来源时钟 12、repository 消费 2、实际预检消费 7、完整执行预检失败场景 2、新冻结门禁 3；同时修正原“已识别版本即可严格就绪”的测试，要求真实证据。
- 定向预检/来源时钟 69 项和冻结 7 项均通过，包含于相关 17 文件/214 项，不重复计数。组合覆盖实际归档 repository、完整预检、联合 HTTP 入口、准备接口、Snapshot 构建/重放、Run 执行及创建重试。
- Server typecheck、build、定向 ESLint、两个新核心函数的复杂度/函数尺寸检查、边界、工作区依赖与 diff check 通过；13 项既有无有效基线尺寸警告保留。
- 新夹具首次缺归一化记账必需的执行模型，复用既有完整模型后第一次重试 69 项通过。类型检查首次发现可选属性与 `exactOptionalPropertyTypes` 不一致，改为存在时传入后第一次重试通过；服务入口 7 项另行重跑通过，属于前述 214 项子集。
- 数据库端口为受控内存实现，归档创建、身份派生、原文内容核验及读回使用实际 repository；本地冻结使用实际 Artifact/Parquet 和 Snapshot Store。没有实际 PostgreSQL 或外部 Provider 请求。

完整组合日志为 `/private/tmp/goal-s05-reconstruction-guards-regression-20260928.log`。69 项定向测试跨午夜运行，沿用启动时命名 `/private/tmp/goal-s05-reconstruction-preflight-directed-20260927.log`，最终通过时间为 9 月 28 日；冻结定向日志为 `/private/tmp/goal-s05-reconstruction-freeze-directed-20260928.log`。其余类型、构建、lint、复杂度、入口、边界、依赖、尺寸日志采用 `/private/tmp/goal-s05-reconstruction-guards-*-20260928.log`。

## 目标运行态验证

按实际应用代码变更执行 infra 官方 `./scripts/sync-code.sh thesis-ledger`，兼容性预检、宿主构建、两端代码同步、重启和健康检查均通过。Server/Worker 仍为同一镜像 `sha256:f51e7f52e3ce141fa29517afae0005ff9c9c19d12009b0a6d8b3f4539ea49b7a`，均 healthy。更新仅在容器可写层，容器重建后不保留，不作为不可变镜像更新的证据。

受控脚本 `/private/tmp/goal-s05-reconstruction-guards-target-20260928.py` 在每个容器实际执行 12 个完整生产预检场景、6 个来源时钟场景、1 个只读 repository 拒绝及 3 个模块导出/构造器注入检查。原响应不变，8 份编译摘要与宿主一致。日志 `/private/tmp/goal-s05-reconstruction-guards-target-20260928.log`；同步日志 `/private/tmp/goal-s05-reconstruction-guards-sync-20260928.log`。

| 编译产物 | SHA-256 |
| --- | --- |
| `backtest-history-input-v3.js` | `4db5c9c4d4a3ae83293c5867672eedcb3a9c6516ea1d05e297c75c868d08520e` |
| `backtest-reconstruction-preflight-v3.js` | `f20a42858ae4f6abe75fa76d92fb2cdf45ddd695b851d1b7e6355b5ebd589c3e` |
| `backtest-preflight-v3-execution.js` | `a1727097addaab2b62e6b7c8a8341a1193caa8189a14af67afbd321c65a829e4` |
| `backtest-snapshot-v3-builder.js` | `f3901c7700d8b221947e7c58be75dee37b7de5346037470f3cd696010301ca33` |
| `backtest-snapshot-builder.js` | `f46990fc09d4d81ffacbfc4ec6a555eb12c97a7831c2bec99b90c43d1c3adb91` |
| `market-pit-reconstruction-source-times-v3.js` | `ff4e6862f88b4b71fdbb074eeedd7f24b645042f34e7a536f761a939551196f6` |
| `market-pit-reconstruction.repository.js` | `e27b02b1b745e9a9a74b40e729f95a48c48c04092370a4fb1038f0d87d303770` |
| `market.module.js` | `547c16baf24793a71004c642095a0bd7fdf2255bb8ffed1b91cc0f5532132f44` |

目标探针只替换 Reader/归档端口及已绑定的必要条件，执行实际编译生产函数；没有业务数据库读写、Snapshot 写入或外部请求。健康与摘要不替代实际 Provider、历史归档、合格 PIT 冻结、Worker 端到端或浏览器验收。

## 后续实施

继续 `S05-reconstruction-decision-window`，建立独立原始历史决策窗口/真实来源版本核验，再贯通合格证据的冻结和旧 V3 离线重验。原 I01 JSONB 往返、来源及浏览器卡点保持耗尽重试后的跳过记录，不机械重试，也不记为通过。完整 M1/M2/M3 和原真实门禁保持原范围，目标继续 active。

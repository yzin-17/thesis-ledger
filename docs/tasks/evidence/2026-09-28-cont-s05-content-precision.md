# S05 v2 实际归档内容截点精度

## 检查点

`S05-content-cutoff-precision / worker_done`。真实内容绑定回归先复现，随后修复及限定验证全部通过。只修改下述三份源码/测试和本文；未修改 Schema、repository、预检、Store、公共出口或原 fixture，全部既有 WIP 保留，无 stage/commit/revert。

| 路径（仓库相对） | 起始 SHA-256 | 最终 SHA-256 / 行数 |
| --- | --- | --- |
| `apps/server/src/market/market-pit-reconstruction-content-v3.ts` | `e831152a1338ce7633a6c8163670b144e663585f9e5e5e0c295c7eab6bb7f768` | `486fc042e6aa5bca6723c7c4c43a1a0a8d84fdfcf1f5bea5ac6067ea87d1b4ea`；154→145 |
| `apps/server/src/market/market-pit-reconstruction-content-clock-v3.ts` | 新增 | `3e243a08088f87366a8cc2196f716338097f3150bacb9687ee22745743f31ec2`；37 |
| `apps/server/test/market/market-pit-reconstruction-content-v2.test.ts` | `4ded0b45e66cee1649aac37247698e9088892bd0c218e132fdd028c7a6d90aea` | `cb3af5f9874655092647fa898ca04377abd950c9355fd93c07eba9051d7343df`；175→263 |

已固定并起终复核未变的三个直接只读输入：Server 精确原语 re-export `b569495a1dc95419b25d3b7744e1e8fda68fa18b281a46393b36b11fd79061bd`；Schemas 原语 `7faf533fb71291ebbed1945e4d51d9e73a2cc5103b78e404b6eb9efeb360b552`；`pit-reconstruction-fixture.ts` 为 `0aa0e52f502c2400b54d1e28ceb8a4bf8b94a2f5d967ddd16abedf1585a21fc1`。没有对全仓所有输入建立起终快照；类型检查覆盖当时的完整 Server 工作区。

## 实际复现与修复

首个回归使用 `v2Fixture`、真实 `MarketWindowEvidenceV3Repository.record/findFrozen` 和真实 `bindMarketPitArchiveContentV3`，只替换持久化端口为既有内存 fixture。归档采用独立 inputFingerprint 并由 repository 生成实际身份、完整响应摘要与序列版本；历史引用/见证更新为该完整归档。归档观察为 `2026-05-21T08:00:00.000002Z`，冻结截点为 `.000001Z`，本次输入观察仍在截点内。首轮收到 `archives-bound`，本应为 `archive-future`；已经通过身份、摘要、范围与本根 Bar 内容门禁，故不是只测试比较器。

修复将内容时钟职责移至同 feature 的独立 helper。v1 沿用原 Date.parse 毫秒路径；v2 用既有 Schemas 精确原语比较实际 fetchedAt、归档 observedAt、全部原 Bar timestamp/availableAt 与原 dataAsOf。未解析或未知偏移同样失败关闭。fetchedAt 仍由真实 Date 转为原毫秒时刻，没有填造更高精度。原读取次数、内容/hash/范围首错顺序、numeric Bar 索引和返回类型保留；仍只输出 `archives-bound`。

新增 10 项真实内容绑定测试：观察早于/等于/等价偏移/晚一微秒/未知偏移，完整归档中未被本根输入引用的 Bar 可见及价格时钟晚一微秒，Date 捕获在截点内及晚一毫秒，以及旧 v1 独立毫秒语义。正向用例保留原文时钟；拒绝用例不伪装历史资格。numeric Bar key 没有扩展：当前 wire 仍要求按 Date.parse 严格递增，最终逐 Bar 比较仍为 isDeepStrictEqual；本叶不声称解决全部 legacy 精度或放宽日线 wire。

`recommend` 已使用。实际 Server 依赖为 es-toolkit `^1.51.0`、安装 1.51.0；根入口针对 instant/date/compare/time 的实际导出只匹配 `isDate` 与 timeout 系列。安装声明及[官方 isDate 文档](https://es-toolkit.dev/reference/predicate/isDate.html)只提供 Date 类型判定，不提供保留任意小数的 ISO 证据时钟比较，故消费已有领域原语。没有新增通用工具层或第三方依赖。

## 命令与证据层

| 顺序 | 实际命令 / 覆盖 | 结果 |
| --- | --- | --- |
| 红用例 | `rtk proxy pnpm --filter @thesis-ledger/server exec vitest run test/market/market-pit-reconstruction-content-v2.test.ts --testNamePattern '实际归档观察晚于冻结截点一微秒' --no-cache` | 1 个预期红用例失败，12 个按名称过滤跳过；实际收到 archives-bound。不是通过，也不是运行时失败重试 |
| 首次修复验证 | 三份定向文件的下述命令 | 65/65 通过；之后新增价格 timestamp 场景并格式化，重新执行最终输入 |
| 最终定向 | `rtk proxy pnpm --filter @thesis-ledger/server exec vitest run test/market/market-pit-reconstruction-content-v2.test.ts test/market/market-pit-reconstruction-content-v3.test.ts test/market/market-pit-reconstruction-source-times-v3.test.ts --no-cache` | 3 文件/66 项通过，零 skip：v2 22、v3 21、source-times 23；不累加此前子集 |
| 类型 | `rtk proxy pnpm --filter @thesis-ledger/server typecheck` | 通过 |
| 普通 lint | `rtk proxy pnpm exec eslint <三份独占TS文件> --max-warnings=0` | 通过，零警告 |
| strict lint | 同一三文件加 `--rule 'complexity:[error,20]' --rule 'max-lines-per-function:[error,{max:220,skipBlankLines:true,skipComments:true}]' --max-warnings=0` | 通过，不提高阈值/增加 ignore |
| 格式与空白 | `rtk proxy pnpm exec prettier --check <三份独占TS文件>`；`rtk proxy git diff --check -- <三份独占TS文件>`；最终逐文件原字节检查 | 全部通过，三份 TS 无尾随空白；新增未跟踪文件另作字节检查 |

前置一次 zsh 未匹配不存在的 `apps/server/eslint.config.*` glob，查询退出 1；随后使用实际根 `eslint.config.mjs` 的精确查询成功。没有据此修改配置或启动更高层门禁。红用例输出包含合成完整响应的 Vitest diff；后续断言先比较 status/必要 reason，避免再次输出完整响应，无凭据/业务原文输出。

## 剩余与交还

未运行共享 build、全包测试、Docker、DB、Worker、HTTP 或 Provider/AI/浏览器门禁；真实预算新增 0、重试 0。最终 PIT 的原发布认证、持续场所、XSHE、修订真实性、执行日历、封存/离线资格仍保持开放；本叶不关闭 S05/S07/S08/S09 或真实 AC。

所有本叶命令均已返回，没有后台进程、数据库容器或保留端口；资源和写权交还协调者。下一步由协调者集中 Review 本三份文件，稳定输入后选择必要的更高层验证。

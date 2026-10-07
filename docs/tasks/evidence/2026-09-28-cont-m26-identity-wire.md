# Tushare 基金身份共享合同实施证据

日期：2026-09-28。任务：`M26-b2-identity-wire`。状态：`worker_done`，仅 Schemas 与离线跨语言合同交付。M26、M2 和真实来源验收保持开放。

## 依据与边界

依据主 [Spec §4](../../specs/2026-09-25-multi-source-adjustment-aware-backtest.md) 的独立 `tushare-fund-identity` 原字节、完整同代码、独立币种、全部映射范围和精确时间合同，及主 [Task §12.9](../2026-09-25-multi-source-adjustment-aware-backtest.md) 的执行包。上游已完成的 [resolver 证据](2026-09-28-cont-m26-identity-resolver.md) 与 DSA 纯解析模块均已读取，实际源码摘要与其记录一致。

已读取 RTK、Codex、项目 AGENTS 和 `spec-driven-workflow` implementation/review 指导。Context Mode 工具未暴露，使用 RTK、有界文件读取和限定输出。按 `recommend` 核对了实际依赖、安装的 `es-toolkit 1.51.0` 出口与 `isJSON` 声明，及其[官方文档](https://es-toolkit.dev/reference/predicate/isJSON.html)：该函数只判断能否被 `JSON.parse` 解析，不能替代重复字段、原字节或精确瞬时合同；Schemas 未依赖该包，因此保留原生解析及既有瞬时原语，没有新增依赖。

实际修改仅为新增专属模块、测试、合成 fixture、本文，以及既有 `market-event-wire-v3.ts` 的必要接缝和 `index.ts` 的一条出口。既有事件测试只读、没有改动；RQData 模块、准入原语、精确时钟、Server 和 DSA 源码均未修改。Schemas `dist` 为本叶独占的可重建产物。保留脏工作区；没有暂存、提交、子代理、凭据读取、Provider 调用、数据库或部署操作。主 Task 由协调者维护。

## 已交付行为与出口

`packages/schemas/src/market-tushare-identity-v3.ts` 定义严格 bundle、原文 envelope 和精确 Tushare 准入分支，新增事件字段为 `tushareIdentityEvidence: { ref, sha256, content }`。只在精确 `data/CN/ETF/CASH_DISTRIBUTION`、`tushare/tushare` 响应要求该字段和匹配准入；其他来源或能力禁止携带，其他来源的原无字段路径保留。RQData 原 `identityEvidence` 和 EastMoney 拆分 `dateMappingEvidence` 保持独立，不能与该字段混用。

- 顶层及各层键均严格；完整 ASCII 六位 `.SH/.SZ` ETF 的查询代码必须等于同完整证券代码，拒绝 OF、Unicode 数字、别名、跨码或缺独立依据。
- 每证券唯一、1..1000 项、合法真实日期；身份与分红币种各有无账号 HTTPS 原文引用和小写摘要，币种只接受显式 CNY/HKD/USD。
- 原文按实际 UTF-8 字节限制 1 MiB，拒绝不完整代理字符、无效 JSON、非整数版本表达与各层解码后重复 JSON 字段，包括转义同名。
- envelope ref/hash 与准入声明相互一致；全部映射在准入标的及日期范围内，选中项覆盖整个请求，所有现金事实币种匹配独立依据。Schema 不重算实际原文字节 SHA；在线/离线 Server 后继必须重算，并负责当前准入、撤销、适配及凭据修订复核。
- 复用 `compareMarketPitEvidenceInstantStringsV1`，核对原 `validFrom/validUntil/recordedAt/fetchedAt/dataAsOf/observedAt/availableAt`，拒绝未知偏移和未来纳秒，最多 1024 位小数、等价偏移与尾零按精确值比较，时间原字符串不改写。
- Tushare 精确准入分支复用原 admission shape 的状态/字段定义并补齐真实日期、唯一证券及严格引用；旧毫秒有效期分支显式排除该精确 tuple，避免先经过旧 Schema 的时间误判或引用 trim。事件通用范围判断按职责提取为局部函数，非 Tushare 的旧毫秒行为保留。

公共运行时出口均由 `packages/schemas/src/index.ts` 导出，并已进入构建产物：

```ts
marketTushareFundIdentityV3Schema
marketTushareIdentityEvidenceV3Schema
marketTushareEventAdmissionV3Schema
parseMarketTushareFundIdentityV3(content: string): MarketTushareFundIdentityV3
isMarketTushareCashIdentityRouteV3(response: {
  routeKey: { kind: string; market: string; assetType: string; capability: string };
  routeTarget: { providerId: string; upstreamSource: string };
}): boolean
validateMarketTushareIdentityResponseV3(response: IdentityResponse): void
```

类型出口 `MarketTushareFundIdentityV3` 为 bundle 的推断类型。`IdentityResponse` 是声明中随函数保留的结构类型，包含可选 `tushareIdentityEvidence/admission/identityEvidence/dateMappingEvidence`、上述路由、`symbol/start/end/fetchedAt/dataAsOf` 字符串和只读 `facts: { currency?: string; availableAt: string }[]`。校验函数成功返回 void，失败抛出；事件 Schema 将其转为稳定的校验 issue。

## 合成 golden 与跨语言证据

`packages/schemas/fixtures/market-tushare-identity-v3.synthetic.json` 顶层显式 `synthetic: true` 与中文说明。内嵌原文为含中文 URL 的格式化 UTF-8 JSON，末尾换行保留；原文字节数 746，SHA-256 为 `6968df31478e972147503480e2e7c8e6438c7e7260e9200f0f27edbf3ef0d840`，同一摘要/ref 绑定原 admission。全部 URL 为 `.example.test`、修订为 synthetic，覆盖保持不完整，不能作为真实身份/分红币种审核或准入。

临时离线验证脚本 `/private/tmp/m26-tushare-wire-golden.py` 由 apply_patch 新建，直接读取该 fixture 原内容 UTF-8 字节与原 admission，调用已完成的 DSA `resolve_tushare_fund_identity`。成功结果核对原 bytes、同完整查询代码、币种、ref/hash，确认输入 admission 不变。13 例通过：原 golden、等价偏移、合法一纳秒到期上界、1024 位小数相等，以及未来纳秒/第 1024 位未来、精确到期、撤销、摘要错配、重复 JSON、额外字段与浮点/指数版本拒绝。零网络；不是生产调用入口、账号权限或公告经济语义审核。构建后的 Schemas 出口再次解析同 golden，通过。

## 实际验证

执行目录默认主仓；DSA golden 命令在相邻 DSA 仓执行。所有最终检查基于下节同一稳定输入，源码没有在成功后继续修改。

| 命令 | 最终结果与范围 |
| --- | --- |
| `rtk proxy pnpm --filter @thesis-ledger/schemas exec vitest run test/market-tushare-identity-v3.test.ts test/market-event-wire-v3.test.ts test/market-rqdata-identity-v3.test.ts` | 122 passed：Tushare 70、既有事件 29、RQData 23；3 文件。 |
| `rtk proxy .venv/bin/python /private/tmp/m26-tushare-wire-golden.py` | 13 passed；实际 DSA resolver 消费同原文字节与准入。 |
| `rtk proxy pnpm --filter @thesis-ledger/schemas typecheck` | 退出码 0。 |
| `rtk proxy pnpm --filter @thesis-ledger/schemas test` | 546 passed，45 文件；仅 Schemas 包。 |
| `rtk proxy pnpm --filter @thesis-ledger/schemas build` | 退出码 0；独占更新 Schemas dist。 |
| `rtk proxy pnpm exec eslint packages/schemas/src/market-tushare-identity-v3.ts packages/schemas/src/market-event-wire-v3.ts packages/schemas/src/index.ts packages/schemas/test/market-tushare-identity-v3.test.ts --max-warnings=0 --rule 'complexity:[warn,20]' --rule 'max-lines-per-function:[warn,{max:220,skipBlankLines:true,skipComments:true}]'` | 退出码 0，无 warning；新增与修改源文件按 complexity 20 / 函数 220 行约束。 |
| `rtk proxy pnpm exec prettier --check packages/schemas/src/market-tushare-identity-v3.ts packages/schemas/src/market-event-wire-v3.ts packages/schemas/src/index.ts packages/schemas/test/market-tushare-identity-v3.test.ts packages/schemas/fixtures/market-tushare-identity-v3.synthetic.json` | 全部匹配文件通过。 |
| `rtk proxy node scripts/check-boundaries.mjs` | Import boundaries: OK；新模块在 Schemas 内依赖，无新增非法跨层模式，门禁无需改规则。 |
| `rtk proxy node scripts/check-workspace-dependencies.mjs` | Workspace dependency graph: OK，8 包；无依赖修改。 |
| `rtk git diff --check -- packages/schemas/src/market-tushare-identity-v3.ts packages/schemas/src/market-event-wire-v3.ts packages/schemas/src/index.ts packages/schemas/test/market-tushare-identity-v3.test.ts packages/schemas/fixtures/market-tushare-identity-v3.synthetic.json` | 退出码 0；另直接检查所有新文件 0 尾随空白。 |
| `rtk proxy node /private/tmp/m26-tushare-wire-scope-check.mjs` | 将实际 inline 检查固化为可复验脚本；有效 HEAD，按项目尺寸门禁相同计数与测试阈值，新增测试 311 行 < 800。其他 owned 源文件不命中 service/page 尺寸规则，函数及复杂度由上方 ESLint 强制检查；没有运行或声称通过工作区全量尺寸 ratchet。构建产物 golden 解析通过，6 个 Tushare 运行时出口可用。 |

首轮定向测试有 1 个前导空白 URL 被 Zod 自动规范化的失败；改为检查原引用后该组合唯一重试通过。随后因自审补充严格引用、JSON 版本表达及精确边界反例，最终定向统计为 122。首次静态 ESLint 命中控制字符正则；改用等价字符码检查。首次加强复杂度检查命中新 validator、旧事件回调与测试 describe；按准入/映射/事件范围职责提取局部函数、拆分两组 describe 后唯一重试通过，没有放宽规则。输入变化后按同级→包级重新完成最终验证。

首次 `rtk pnpm --filter @thesis-ledger/schemas typecheck` 被 RTK 报告不支持 pnpm tsc 的 filter、忽略 filter 后退出码 1；该结果未记为通过，随即用 `rtk proxy` 执行精确包级命令成功。后续包级命令均使用 proxy；无 Server 或仓库全量 build、DB、Provider、目标容器/浏览器检查，后继运行态门禁保留。

## 输入与产出摘要

摘要覆盖实际源码、合成 fixture、复用原语与离线脚本；行数按项目 guardrail 的 `split(/\\r?\\n/).length` 计数，含文件末尾空行。

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `packages/schemas/src/market-tushare-identity-v3.ts` | 249 | `6a0c4c806098e2bf446fb80ba7cd0960829a8d9777476e805ecd5e2df662ca6f` |
| `packages/schemas/src/market-event-wire-v3.ts` | 271 | `f43ce11897a84044df4550ad8f9ff575d7ff3fee9af29034cfbfcd751c6134e7` |
| `packages/schemas/src/index.ts` | 56 | `c2f14362bdb1e786e4f52f93ccd29bee17e17a481d0205e8f41a38695350f4e1` |
| `packages/schemas/test/market-tushare-identity-v3.test.ts` | 311 | `0fb066a58c3cb8cc9b51071c9dfd385a73aae2cdf8f12f992cf5147365a9faa3` |
| `packages/schemas/fixtures/market-tushare-identity-v3.synthetic.json` | 104 | `0298618600ce99007e75da74b31344a0f6fa21933631e70f26231e9d5f2d2148` |
| `packages/schemas/src/market-event-admission-v3.ts` | 39 | `49bbf73da2b0045db4ea64f0893f289a39a41360a5b52e12db77f40bee25654c` |
| `packages/schemas/src/market-pit-evidence-instant-v1.ts` | 78 | `7faf533fb71291ebbed1945e4d51d9e73a2cc5103b78e404b6eb9efeb360b552` |
| `packages/schemas/src/market-rqdata-identity-v3.ts` | 137 | `7c8be9d04b9cbd05b37624832c8043640a5f402921bbabb968e8a9e4abba9c32` |
| `/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis/src/services/tushare_fund_identity_evidence.py` | 184 | `3fb8b53a019146789bad5a126136898f9a30b55094f1a2edc6930ad4cf9f599b` |
| `/private/tmp/m26-tushare-wire-golden.py` | 86 | `3c3a6356dd0cb0a24bd3588c7cb07ff9466ac2108a25b6c93a19c822c3ae0f7a` |

构建产物摘要：

| 文件 | SHA-256 |
| --- | --- |
| `packages/schemas/dist/market-tushare-identity-v3.js` | `e45899f2dfbcb90caf20b161c927b81d33dfa78cdbff9b4363318cfaf12ada5a` |
| `packages/schemas/dist/market-event-wire-v3.js` | `594931a9ee5f924888f66bb0afce5d5b12109280556d2796a6a560823570d73c` |
| `packages/schemas/dist/index.js` | `bf2a1c88d294af5920ba27d8f98fe102c77557444c1cd274dd46d7401a3d0d39` |

## 本叶自审与交接

对照执行包自审通过：严格字段、原文字节、完整同代码、独立币种、全部 scope、精确瞬时、来源互斥及旧路径兼容均有直接实现和定向反例；实际 DSA resolver 与构建产物已消费合成 golden。此为局部实现自审，协调者仍负责主 Task 与跨运行时最终一致性 Review。

后继必须完成 Server 在线/离线原字节 SHA 重算、同精确时刻与当前准入/来源/适配/凭据修订复核，再释放 DSA 生产者接入。真实标的身份/币种原文审核、账号权限、完整历史覆盖和目标部署均未完成，不能从本叶推定。主 Task、TODO 与目录没有由本叶更改。

全部命令已结束，无运行中进程、子代理或后台验证；Schemas dist 与源码写权可交还协调者。无暂存或提交。

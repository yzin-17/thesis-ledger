# G3 HTTP 响应诊断本地证据

日期：2026-10-25。关联[Task D21](../2026-10-18-research-evidence-evolution.md)及[Spec G3-RSP1～RSP4](../../specs/2026-10-18-research-evidence-evolution.md)。

> 当前部署接续（G3-D24）：正式 sync-code.sh thesis-ledger 退出 0，当前 Server／Worker 各 15 模块与宿主构建一致，实际 Schema runtime.httpResponse 已生效；capabilities 200／canCreate=false，V2 关闭。22 表、原失败、环境／配置／挂载保护通过，模型 0、余 8 次冻结。仅容器可写层更新，镜像及真实响应／重建反读未验；见[部署回执](2026-10-25-g3-d21-deployment.md)。

> 部署前置历史（G3-D23）：三条手机跨应用引用已修、原边界门禁通过；该次 capabilities 空 502 经 Context Mode 的 macOS 系统代理路径，显式直连为 200／canCreate=false。当时两目标运行面仍缺 D21，新旧模块与实际包入口已核对。见[前置核查证据](2026-10-25-g3-d21-preflight.md)。该次没有部署／模型调用／目标配置或业务写入，余 8 次冻结；当前部署以上方 D24 为准。

> 后续离线对照（G3-D22）：已完成真实 SDK 的 A～F 固定故障特征矩阵，未发现固定反例证明的本地业务缺陷，未改生产源码或扩展留存。见[路径、候选排序及验证](2026-10-25-g3-fault-signature-matrix.md)。本文的部署／目标核查继续只证明各历史记录时点；本轮模型／部署／目标写入均为 0，余 8 次冻结，G3 未完成。

> D21 历史接续：D20同体零网络重建通过；当时只读核实V2关闭与数据保护，目标仍未包含D21。该次能力接口读取HTTP502后停止，canCreate未确认；当时跨层引用门禁尚未解除。没有部署或模型调用，详见文末“D20同体零网络核对与运行态只读预检”；当前前置以上方 D23 为准。

## 当前边界

用户批准只读盘点空间，并在空间恢复后补齐脱敏、限长的响应诊断与本地验证。本轮不部署、不新增模型调用；余8次冻结。保留原数据、来源启停和20条路由，V2保持关闭。[D20关闭与保护证据](2026-10-25-g3-formal-free-sdk-recovery.md)继续复用，不将历史核对声称为本轮重新验收。

## 只读空间盘点

- 初次检查约165MiB可用；同轮复核`df -h / /private/tmp`已约25GiB，`statvfs`为25,903.8MiB。未执行任何删除、清理、Docker重启或状态变更，未推断空间恢复原因。
- `/Users/yzin/Library/pnpm/store`占用4,134.3MiB；仅测得总占用，未证明其中多少为未引用缓存，未清理。
- `/Users/yzin/.npm/_logs`约0.9MiB；项目`node_modules/.cache`约0MiB。所查npm内容缓存、pnpm／node-gyp／pip缓存和项目`.turbo`路径不存在。
- `docker system df --format '{{json .}}'`只读统计在30秒后超时；未用镜像和BuildKit可回收量未核实，不重试或扩查其他Docker入口。
- `Docker.raw`逻辑32GiB、分配约20.5GiB，仅作存储归属说明，属于受保护Docker数据，不作为删除候选。

## 本地实施与验证

实现了首个实际HTTP响应的状态／类型、字节数、原始SSE事件及脱敏错误诊断，通过既有运行诊断进入失败账本。无响应时字段缺省；未完成流与过长诊断明确标记。使用透明流旁观，不clone或预读；本地对照验证了请求体、错误映射和每次一次发送。新增字段可缺省，旧记录不重写；本轮没有数据库结构或依赖变更。

| 命令（均经`rtk proxy`） | 结果 | 证据边界 |
| --- | --- | --- |
| `pnpm --filter @thesis-ledger/schemas exec vitest run test/ai-http-response-diagnostic.test.ts test/ai-http-request-diagnostic.test.ts` | 通过，2文件／7项 | 新旧可选合同、严格字段与JSON往返 |
| `pnpm --filter @thesis-ledger/schemas build` | 通过，退出0 | 当前Schema编译产物 |
| `pnpm --filter @thesis-ledger/server exec vitest run test/ai/ai-http-response-diagnostics.test.ts test/ai/ai-http-response-diagnostics.integration.test.ts test/ai/ai-generation-failure-diagnostics.integration.test.ts test/ai/ai-generation-stream-diagnostics.test.ts test/ai/ai-generation-stream-diagnostics.integration.test.ts test/ai/ai-http-request-diagnostics.test.ts test/ai/ai-http-request-diagnostics.integration.test.ts` | 通过，7文件／25项 | 真实本地HTTP／SSE与当前SDK；响应字节、取消／读取失败、秘密隔离、大小上限、原请求／错误／无重试对照；原生产Store通过JSON边界的新实例反读。不代表PostgreSQL或在线Provider验收 |
| `pnpm --filter @thesis-ledger/server typecheck` | 初次TS2322、退出2；获准补`as const`后通过，本轮嵌套断言后再次通过、退出0 | 测试版本数组类型卡点已解除 |
| `pnpm --filter @thesis-ledger/server exec vitest run test/ai/ai-http-response-diagnostics.integration.test.ts` | 通过，1文件／3项 | 类型修正后的真实本地HTTP对照 |
| `pnpm --filter @thesis-ledger/schemas exec vitest run test/ai` | 通过，9文件／33项 | 受影响AI合同范围回归 |
| `pnpm --filter @thesis-ledger/server exec vitest run test/ai` | 通过，53文件／420项；14文件／76项跳过 | AI范围回归；数据库集成跳过不算通过 |
| `pnpm --filter @thesis-ledger/server exec vitest run test/ai/ai-generation-failure-diagnostics.integration.test.ts` | 通过，1文件／1项 | 本轮等价嵌套断言及真实生产Store的JSON反读 |
| `pnpm --filter @thesis-ledger/server build` | 本轮重新通过，退出0 | `tsconfig.json`包含`test`，断言改动后重建；Schema33项／Server其他回归的未变输入证据复用 |
| `pnpm exec prettier --check <下表11个输入>` | 通过，退出0 | 本轮代码／测试输入 |
| `pnpm exec eslint --max-warnings=0 <下表11个输入>` | 通过，0错误／0警告 | 默认ESLint规则 |
| `pnpm exec eslint --rule 'no-nested-ternary:warn' --rule 'complexity:[warn,20]' --rule 'max-lines-per-function:[warn,{max:220,skipBlankLines:true,skipComments:true}]' <下表11个输入>` | 本轮退出0，0错误／2条存量复杂度警告（30／26） | 新增断言复杂度已回到基线，门限20未改；对照见下文 |
| `node scripts/check-boundaries.mjs` | **前轮失败，退出1；本轮未重跑，仍未通过** | 移动端验收夹具3条跨层引用，交原任务处理 |
| `node scripts/check-workspace-dependencies.mjs` | 通过，退出0 | 8个包的依赖图 |
| `node scripts/check-file-size-guardrails.mjs` | 退出0，保留8项存量告警 | 未提供有效基线的部分仅作告警，不声称全仓尺寸ratchet已验证；本轮代码／测试输入均低于适用尺寸阈值 |
| `node scripts/check-secrets.mjs` | 通过，退出0 | 扫描17,408文件；不输出凭据 |
| `git diff --check -- <下表11个输入>` | 通过，退出0 | 仅覆盖已跟踪diff；11个输入包含未跟踪文件，其格式由Prettier检查覆盖 |

类型及前轮边界失败均按约定暂停；用户随后明确批准仅修本轮G3断言、核对复杂度并继续独立门禁。当前独立检查已完成；边界仍保留失败，未修改移动端、边界脚本、依赖或环境，未部署。

## 已处理的类型卡点

位置：`apps/server/test/ai/ai-http-response-diagnostics.integration.test.ts:71`的版本数组；编译错误在第82行`contract: { id: 'research', version }`。

用户已批准并应用字面量元组，保持V1／V2本地对照及所有断言：

```ts
for (const version of ['research-generation-v1', researchGenerationV2Contract.ref.version] as const) {
```

类型检查和受影响测试已通过，不再以此作为当前阻塞。

## 全仓边界阻塞与已批准的复杂度处理

全仓边界发现`apps/mobile/release/acceptance-batch4-2026-10-24/controlled-fixtures.test.ts`直接引用：

- `../../../server/test/backtest/nav-preparation.fixtures`
- `../../../server/src/backtest/backtest-nav-preparation`
- `../../../server/src/backtest/backtest-nav-preparation-result`

归属移动端任务，本聊天不修改移动端文件、边界脚本或增豁免。需移动端任务修复后重跑全仓边界；继续独立本地检查也不能把此门禁标为通过。

前轮定向guardrails有两条警告：未改动的`observeProviderChunk`复杂度30；失败诊断集成测试复杂度27。用户批准仅将新增断言改为以下等价嵌套匹配，现已应用，原有字段、期望值与校验标准保持：

```ts
expect(runtime).toMatchObject({
  httpResponse: {
    status: 200,
    contentType: 'sse',
    bodyComplete: true,
    sse: { events: 5, invalidJsonEvents: 0, done: true, incompleteEvent: false },
    error: null,
  },
});
```

前轮Context Mode内置Node的原生resolver签名错误仅保留为分析历史。本轮通过已有正式CLI运行环境执行`rtk proxy pnpm exec node --input-type=module -e <只读ESLint内存基线对照>`，Node为`v24.18.0`，未安装依赖或修改环境。

同一文件的三份内存输入均为0错误：移除本轮唯一新增断言得到的增量基线复杂度26；还原前轮可选链断言为27；当前嵌套断言为26。该基线是明确的增量重建，不冒充Git历史快照。证明当前新增断言不再增加存量复杂度；方法30与测试26的存量告警仍保留，不提高门限或加ignore。

## 验证输入

工作区未提交。首次开始时1179项脏状态，上轮接续前1186项（新增7个本轮文件），本轮接续前1187项；无关WIP原样保留，未执行stage、commit、reset或clean。每次接续前11个诊断输入均与上一回执一致。本次仅修改获准的G3断言；版本数组类型已在上轮修正，原摘要为`f3201a30a1810cf0020e8aa1bbf22fcbccd14d322286045f03aa3c99f28f0ed6`。失败诊断测试改嵌套断言前摘要为`ce317aac7bb6699c0a4e4c808942f47d6ae022c7403953060e42d9782c7fdcd8`；下表为当前验证输入：

| 路径 | SHA-256 |
| --- | --- |
| `packages/schemas/src/ai-generation-http-response-diagnostic.ts` | `d14e0167d468d89a52023962c581b75347a3e0297c4155b43f0e8563a9584126` |
| `packages/schemas/src/ai-generation-runtime-diagnostic.ts` | `5ec4735e2dd4d151660620b90fc2d00eda394a526bc577188151160544351a97` |
| `packages/schemas/test/ai-http-response-diagnostic.test.ts` | `3330a6632fb0bee16320367fb46effaa10d1baa7e8ff14c44b2a38514d260c37` |
| `apps/server/src/ai/ai-generation-http-response-error.ts` | `174b3f968f1b59ad530fd89e4def9e1f389c1cf912a4d3960ec9e789a6590dad` |
| `apps/server/src/ai/ai-generation-http-response-diagnostics.ts` | `514f226424932b94adcf0946730bae813d2a82d114afbff633bd0a711e54269c` |
| `apps/server/src/ai/ai-generation-stream-diagnostics.ts` | `f751e781e40ad47a0dc28712f96065bc606c8e9170f2c757ea054fb4edaeb16c` |
| `apps/server/src/ai/ai-generation-http-request-diagnostics.ts` | `45ed0488846c61e69702335072f5ba51fc32ac88fa083000561453ee0fe3d2e6` |
| `apps/server/src/ai/ai-sdk-generation-model.ts` | `84b8f502d1ddbe17e5f93bc53bcb69df9de876158f7b7cc77149045893acc7f8` |
| `apps/server/test/ai/ai-http-response-diagnostics.test.ts` | `1d61a7b88b544e5e446ec6d2b7d3fb41b3ee6cb18baac07de5362393565099a8` |
| `apps/server/test/ai/ai-http-response-diagnostics.integration.test.ts` | `8a38df692c9d83414371902dca592998e945eeac4709d859440b35aa6bb88515` |
| `apps/server/test/ai/ai-generation-failure-diagnostics.integration.test.ts` | `97e6cfc68d565ebe4bd68cc7ad9b8be906f827f0dfd96fd81ca402bfe5e8c79b` |

## 收口与未完成

上轮收口空间约14,546.9MiB，本轮接续前约14,454.7MiB，收口约14,331.2MiB。未清理缓存或镜像；Docker统计超时后未再尝试其他Docker入口，未重启或改变目标容器。

本轮外部模型调用0次，剩余8次冻结，无费用结算变化；未部署、未变更目标业务数据、来源启停、路由或V2环境配置。复用D20已关闭及保护证据，不声称本轮完成新的目标数据库／运行态核对。G3旧请求仍为失败且实际费用未知，新诊断不能恢复它未留存的原响应。

Review结论：D21a本地实现完成，断言复杂度恢复增量基线，受影响测试／类型／构建、默认lint／格式及独立依赖／尺寸／秘密检查已完成；已过且输入未变的AI回归继续复用。D21b仍受移动端全仓边界阻塞，须原任务修复后复验；未豁免或标为通过。线上响应留存和G3正向生成仍未执行，D21整体及G3未完成。不新增TODO、不归档、不提交。

## 本次接续的部署前只读核查

核查时间：`2026-10-25T05:00:09+08:00`。用户在诊断结论后回复“帮我实施”，本次按上一答复的有条件方案接续：先满足部署门禁，再经infra正式入口更新并最多进行1次正式SDK采样；费用上限0元、无直连／用途复验／自动重试，保持原模型与推理默认，结束后关闭V2并核对保护。该授权不包含移动端修复、门禁豁免或剩余8次的批量调用。

### 已执行与证据

- 通过`rtk proxy python3`只读核对工作树、现行Task、规则、既有摘要及已知门禁输入。主仓HEAD为`da002744bd317b7754832c6ac41d169bcf005e27`，infra HEAD为`3f661df1deb3de894755dcc66e584abb4165d014`；未提交状态分别为1188项和105项，未stage／commit／reset／clean。HEAD不代替WIP输入指纹。
- 上表11个D21代码／测试输入的实际SHA-256全部匹配，复用相应既有本地验证，本次没有重跑测试或构建。
- 已知阻塞文件`apps/mobile/release/acceptance-batch4-2026-10-24/controlled-fixtures.test.ts`仍存在，第7～9行仍分别引用`../../../server/test/backtest/nav-preparation.fixtures`、`../../../server/src/backtest/backtest-nav-preparation`、`../../../server/src/backtest/backtest-nav-preparation-result`；文件SHA-256为`42cc4f66e367bccf749e40bce96915205b974d43f35c064a69a1343e5fb3b756`。此处仅核对原阻塞是否解除，没有调试或修改移动端。
- `scripts/check-boundaries.mjs`现行SHA-256为`77aaefb6ec93a195d43541d515e28d7a11c818eba87b19f834d0e20c18d249ba`；其第467～470行仍拒绝跨应用引用。原非法引用仍在，未将D21b标为通过，也没有重复执行同一失败门禁；此前退出1仍按原证据保留，不冒充本轮执行结果。

### 停止位置与最小解除条件

部署前置尚未满足，本次不进入Docker／目标数据库或运行态检查，不运行sync-code.sh／update.sh，不改变配置或V2状态；目标当前健康、空间、V2开关及canCreate均未重新核实，D20关闭证据仅按历史范围复用。没有新增模型调用，剩余8次未消耗并保持冻结；D20实际费用仍未知。

最小解除条件是由原移动端任务按仓库边界规则修复上述3条引用，再运行`rtk proxy pnpm exec node scripts/check-boundaries.mjs`并取得通过证据。解除后仍须重新核对D21输入、目标门禁、冻结材料与最终发送摘要及原数据保护，才可进入已提出的单次方案；本次不会自动等待或恢复执行。不得把该部署阻塞当作Provider错误根因，也不得以本地诊断或此记录代收G3。

本次仅回写原Task与本证据，未新建平行方案，G3-D8／D20／D21b及G3总体保持未完成。

## D20同体零网络核对与运行态只读预检

用户要求“继续直到解决问题”后，继续不依赖部署门禁的G3只读核对与本地验证；没有把该要求解释为移动端修复、门禁豁免、批量模型调用或自动重试授权。主仓／infra的HEAD仍分别为`da002744bd317b7754832c6ac41d169bcf005e27`／`3f661df1deb3de894755dcc66e584abb4165d014`；开始时WIP条目1448／105，未stage／commit／reset／clean。11个D21输入在开始与零网络检查后均匹配原表。

### D20冻结输入与最终请求

通过目标PostgreSQL的`BEGIN READ ONLY`及有界语句超时，仅取原run的`modelMetadata.frozenResearch`，没有重新获取行情或新闻；原材料仅经进程内存传入已有Node `v24.18.0`。调用原`verifyAiFrozenResearchV2`核验完整性，再用`buildFrozenResearchMessagesV2`、完整`researchGenerationV2Contract.schema`与原SDK适配器构造请求。导入适配器前替换`globalThis.fetch`为仅接受离线地址的内存fixture，不使用真实凭据、真实网络或业务执行／结算入口。

- 冻结输入指纹：`e349be19a05d41ff3232c950cc2e1b57f3113b06a9fb16828d6ad8673ffa8ff1`；11份证据均通过完整性与可用材料检查。
- 原SDK最终请求：22,517字节，SHA-256=`0beccf88684d2b4817f3143e0e391815b5936d8627af89cf8169ead3b723fb8b`，与D20留存摘要完全一致；不是D19的22,542字节请求。
- 参数保持`stream=true`、`response_format=json_schema`、`strict=true`、`provider.require_parameters=true`、`max_tokens=20000`、`include_usage=true`；未显式设置`reasoning`或`reasoning_effort`。包版本为ai 7.0.107、openai-compatible 3.0.53、zod 4.4.3。
- 只返回1个合成HTTP502／JSON错误，D21留存`status=502`、`bodyComplete=true`、`origin=http_body`、`category=provider_error`及合成上游分类`overloaded`；命令退出0，无重试。合成502／503和overloaded均由本地fixture指定，**不证明D20实际状态或根因为过载**。真实模型调用0次，未保存Prompt、原请求正文或凭据。

首次临时命令有一处对象括号缺失，未执行项目校验；入口`pnpm exec node`先输出工作区安装检查及Already up to date，随后退出1。该次stderr未保留，不能由此推断项目／SDK故障或依赖状态。已识别并只修正自编命令语法，以已有Node绝对路径先做语法检查（0），再执行上述零网络检查（0）；未主动执行安装／重装命令、配置变更或真实模型重试。上述pnpm入口的自动工作区检查不作为全依赖树未变化的证据；11个诊断输入的摘要保持，但没有全依赖树前后快照。

### 实际目标与数据保护

只读`docker ps`和inspect确认五个目标容器健康；Server实际`AI_RESEARCH_V2_WRITES_ENABLED=false`，`AI_RESEARCH_POLICY_JSON`不存在。只读文件摘要确认目标仍缺少`ai-generation-http-response-diagnostics.js`与`ai-generation-http-response-error.js`，相关请求／流诊断及模型构建模块与本地D21构建不同，不能把既有容器健康或旧更新记录当作D21已部署。

原D20 run仍为failed／research_unknown_outcome、result不存在；整行摘要仍为`d5f9ca41c5b5bf72895025c1f0c3cbca`。在`2026-10-25T05:08:04.793+08:00`通过既有audit.mjs仅执行只读查询：数据库／owner为thesis_ledger，结构head为20261023010000_report_metadata_snapshots；D20基线的17张保护表原行全部保留、旧AI摘要保持，D20 submission仍仅1条，来源控制摘要及20条路由保持，原功能开关匹配、无临时策略。没有宣称各表总数／全表摘要完全不变。

随后读取`GET http://127.0.0.1:3000/api/v1/research/capabilities`，Python urllib返回`HTTP Error 502: Bad Gateway`，流程退出1；未取得canCreate字段。此为本轮能力接口读取失败，**不是OpenRouter响应，也不能据此断言目标服务本身故障**：该次没有留存响应体或核实中间代理路径。没有重试、换入口、重启、清理或扩大日志搜索；本次canCreate保持未知，不能套用D20的历史false。

### 当前停止位置

原移动端夹具3条跨层引用及原文件摘要仍在，未调试／修改移动端或门禁，没有重复运行已知失败的全仓边界。新能力接口读取失败后停止后续目标操作。下一步须明确处理该只读HTTP检查失败的范围；进入部署前仍须解除跨层引用门禁，并复核实际canCreate及目标一致性。原禁止处理移动端的边界未解除，不能把本轮连续推进要求当作绕过门禁的依据。

本轮没有运行sync-code.sh／update.sh，没有配置或业务写入、没有模型请求，剩余8次未消耗；正式G3及D21b保持未完成。零网络请求重建只能证明输入可复现与合成响应接线，不补回D20原响应、不确认D20实际费用，也不代替真实报告／引用／历史及发布验收。

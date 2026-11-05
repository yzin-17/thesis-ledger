# 研究阶段化真实对照接续记录

日期：2026-11-01（北京时间）。对应[原Task](../tasks/2026-10-18-research-evidence-evolution.md#p3阶段化执行的条件任务)的T15b.1～3及[真实对照协议](../specs/2026-10-18-research-evidence-evolution.md#真实模型对照协议2026-11-01)。本记录保存本轮授权、输入及执行事实，状态由原Task维护。

## 授权与只读核查

用户确认没有现成案例材料，要求使用现有Cloudflare Provider、请求数无上限，随后明确本次总费用最多5 USD。该预算仅属于本次阶段化对照，不改变其他业务、默认路由或后续生产启用条件。

正常目标为`thesis-ledger-dev`，Server/Worker与其余三个项目服务均健康；另一个`skillatlas`项目未操作。只读Prisma事务核对当前Cloudflare为停用、无用途、原凭据已配置，修订`2026-10-30T19:42:02.444Z`；凭据密文摘要为`ef66efc8d0f5412598105e2fdaaa54eb0065d9493b0edcf0f860846b8a6a0838`，不输出或落盘明文。模型为既有`@cf/qwen/qwen3.8-27b`，冻结输入/输出费率分别0.00045/0.0032 USD/千Token。

为核实原0 USD条件，曾用现有凭据执行一次账户订阅GET；Cloudflare返回403、错误码10000，没有取得订阅或免费额度信息。没有扩大凭据权限、开启计费或修改账号。用户随后给出5 USD预算，解除本次金额缺口；不将保存费率估算称作真实账单。Cloudflare的[官方定价说明](https://developers.cloudflare.com/workers-ai/platform/pricing/)区分免费额度和付费超额，不能据模型支持免费方案推断该账号当前可免费完成80次请求。

## 实施边界

先按原Spec建立20个互不重复的人工领域案例与独立评价，完整标明合成来源，不把它们记作历史价格、真实新闻或实际收益证据；随后以既有SDK进行本次真实模型对照。原两例受控驱动、生产单链、正常配置/账本及其他任务验收边界保持。

## 本地实现与验证

20例固定集位于`apps/server/test/fixtures/research-stage-benchmark-v1.json`，独立评价为`research-stage-evaluation-v1.json`；源定义由`scripts/build-research-stage-benchmark.ts`维护。各例问题、领域事实、主题和冻结指纹独立，均通过当前V2冻结完整性及实际材料形状核验，不复制原两例。评分明确限于预设概念覆盖；不宣称人工数据提供真实来源或经济价格资格。

新增`research-live-experiment-protocol/budget/arm/driver/evaluation.ts`，按协议、费用、单组执行、全实验编排及评价分责；不扩展原427行受控驱动。维护入口`scripts/research-live-experiment.mjs`通过固定开发Server的只读事务取得现有Cloudflare配置及内存凭据，模型请求由宿主当前SDK发出，模型结果和审计仅写本地忽略目录。正常服务不部署新代码。外发只允许该账号官方Chat POST、禁止重定向与同请求重发，5 USD在独立协议及派发前预留共同限制；正常12表、凭据摘要和配置前后分别核对。

验证按定向→包级/编译→仓库门禁执行：

| 范围 | 实际结果与边界 |
| --- | --- |
| 最终定向 | `research-live-experiment.test.ts` 14项通过；包含20例两组80次受控生成、独立封存不泄漏、精确5 USD授权、未知消耗/模型漂移停止及无效实报费用 |
| SDK实际HTTP | 同一定向套件使用现有SDK与真实回环HTTP完成80请求，接收与审计一致；真实Cloudflare仍由T15b.3单独验收 |
| 入口守卫 | `node --test scripts/research-live-experiment-target.test.mjs` 2项通过，覆盖跨账号/地址/方法/URL凭据拒绝及公开回执脱敏 |
| AI包 | `vitest run test/ai`共741项，658通过、83跳过、0失败；之后新增精确金额边界的1项与类型修正由最终14项定向及最终编译证明，不声称重跑最终全包 |
| 编译 | 最终`nest build`退出0；首轮新测试模型字符串被TypeScript拓宽导致2个类型错误，显式使用协议类型后通过；未修改依赖 |
| 仓库 | 边界、8包依赖图、文件尺寸通过；7个既有尺寸告警保留，无阈值/ignore调整；6个新TS输入定向ESLint通过 |
| 固定目标预检 | 维护入口缺省模式退出0，真实只读核对12表、配置、模块和无在途AiRun，模型请求0次 |

首轮定向为8通过/3失败，原因为测试伪计量未使用现行`status`及包含无效`totalTokens`；修正后10通过/1失败，剩余测试将不完整计量误标为`reported`，修为`partial`后通过。原始报告保留在`/tmp/tl-p3-live-directed*.json`，核心失败及修正事实保存于本文。定向lint首轮仅报类型导入和测试中未使用的流变量，修正后通过。未把这些夹具/类型问题当成上游失败。

原始通过输出包括`/tmp/tl-p3-ai-package.json`、`/tmp/tl-p3-live-directed-accepted.json`、`/tmp/tl-p3-server-build-accepted.log`及`/tmp/tl-p3-{boundaries,file-size,dependencies}.log`。进入真实调用前将这些结果与实际输入摘要保存到`.recovery-artifacts/research-live-experiment-20261101/`，避免仅依赖临时文件。

T15b.1/T15b.2仅完成各自本地条件。真实生成、质量差异、费用/时延及是否激活尚未由本节证明，继续由T15b.3维护。

## 首例真实结果与本地进程中断

原入口为`node scripts/research-live-experiment.mjs --execute --output=.recovery-artifacts/research-live-experiment-20261101`，从主仓执行。首例`single-price`单链与三阶段均通过V2结构、引用、范围及数值核验，覆盖分均为1，耗时分别75,852ms和179,152ms。四次请求有完整计量，按冻结费率合计估算0.02921090 USD；实际账单费用仍未知。

第五次派发记录位于2026-11-01T10:37:18.271Z。之后执行会话已不可访问，本地同入口进程不存在，原目录没有终态回执，只有首例两组及派发计数5；未取得第五次回执，不推断供应商是否完成或实际费用。进程丢失原因未确认，没有将其归因于模型或Docker。原文件和摘要保留于`.recovery-artifacts/research-live-experiment-20261101/interrupted-run.json`；原在途请求身份未落盘，明确为未知，不补造requestId。

原入口仅在组完成后保存结果，暴露进程消失时的请求审计空窗。T15b.2r因此新增每请求派发前、收到计量及核验后原子检查点，执行器与封存消息/评分分离；补上独立工作进程、完整组复用、原协议/评分核验、累计金额及未知预留。原未知尝试进入失败分母，缺失耗时保留未知；不会因接续而通过费用或时延激活条件。

修复后的18项定向与5项Node守卫通过，其中包括实际结束自有测试进程后读取完整检查点，以及父进程退出后独立测试进程继续写入回执。AI包本轮746项：663通过、83跳过、0失败；Server编译退出0，边界、文件尺寸及定向ESLint通过。通过结果为`/tmp/tl-p3-live-recovery.json`、`/tmp/tl-p3-ai-recovery-package.json`、`/tmp/tl-p3-server-build-recovery.log`及`/tmp/tl-p3-recovery-*.log`。

## Docker恢复与累计预算接续

恢复代码完成后，真实目标预检发现Docker daemon不可连接；通过infra工作目录的`bash scripts/docker-desktop.sh start`启动，退出0。随后发现原五服务为`Exited(255)`且`restart=no`，没有活动更新进程。使用已有入口`node scripts/resume-existing-development.mjs --confirm=thesis-ledger-dev`恢复，退出0；该入口现有4项定向通过。实际保持五个原容器、镜像及全部挂载，仅按依赖顺序启动，未构建、替换或重建。Server/Worker仍为`sha256:1654b11a1f4b39c94bfff670dec539b46e373af427cd8ea14c88da80a3622b45`。

恢复后独立预检证明原12张保护表全行摘要、Cloudflare密文摘要/配置修订、固定集与评价文件字节摘要均与首轮一致。需要区分：服务恢复发生于后续预检阶段，不能据此确认先前本地实验进程消失的原因。未针对其他项目执行容器操作。

第五请求按整组输入100,000、输出6,000 Token的冻结费率保守预留0.06420 USD，只是预算占用，不是实付费用。原四次估算0.02921090 USD加预留后，接续预算从0.09341090 USD开始占用，授权总额仍5 USD；未知原计量、费用、结果与耗时保持未知。

接续命令在主仓执行：`node scripts/research-live-experiment.mjs --execute --background --resume=.recovery-artifacts/research-live-experiment-20261101 --output=.recovery-artifacts/research-live-experiment-20261101-resume`。父入口退出0，独立工作进程PID 27888，启动于2026-11-01T11:10:06.282Z；后续确认其仍存在，首个新请求的`dispatching`检查点已持久化。首例两组及其4个请求被验证复用，未再次派发；原第五请求保留为未知历史，未完成组使用新attempt接续。封存基准、评价、模型/费率及提示词保持。

当前机器入口为`.recovery-artifacts/research-live-experiment-current.json`。接续目录保存`sealed-inputs.json`、`started.json`、`worker.json`、`request-journal.json`和逐组结果；最终结论须等实际终态`result.json`及独立保护检查，不能以工作进程已启动或首例成功关闭T15b。

## 非流式接续终态

接续工作进程于2026-11-01T11:13:12.284Z保存终态。原首例4次请求被复用，本轮仅新增2次：`stale-price`整理阶段取得完整计量，输入4,363、输出1,222 Token，冻结费率估算0.00587375 USD；随后反证请求`b36d0e61-e2f7-40bd-b4cf-50fc3c0e252e`约120秒后返回`upstream_timeout`。现行SDK将其归为上游408/504类错误，当轮未保存精确HTTP状态，不能再细分；本地600秒组期限尚未耗尽。

未知消耗触发停止，没有自动重试。`.recovery-artifacts/research-live-experiment-20261101-resume/result.json`记录累计派发7次、全部案例未完成、正常12表和配置保护通过。累计5次完整计量估算0.03508465 USD，实际账单仍未知；另有原中断请求及本次上游超时共2笔结果/费用未知。原协议的首例配对及失败完整保留，不能据此形成20例结论。

## 流式协议与当前执行

T15b.2s将真实协议版本固定为`research-live-experiment-v2`，显式使用现有SDK流式交付；原受控协议继续使用默认单次交付。首输出、块间隔及组总期限沿用既有期限helper；每阶段仍须通过V2结构、引用、范围和数值核验后才交下一阶段。模型、固定集、封存评价及评分阈值保持，旧非流式结果不并入新协议的质量/时延配对。

历史预算独立校验协议、模型/费率及数据/评价摘要，只转入累计消耗与保守预留。两笔未知分别预留0.06420 USD，合计0.12840 USD，加原估算0.03508465 USD后，新协议起始占用为0.16348465 USD；总上限保持5 USD。预留不是实付费用，未知费用不补零。

验证结果：流式新路径20项及原受控驱动21项，共41项通过；Node进程/目标/历史预算守卫6项通过。AI包748项，665通过、83跳过、0失败；Server编译、边界、文件尺寸及定向ESLint通过。实际回环SSE覆盖完整20例80次受控请求，不把它计作Cloudflare实测。通过日志为`/tmp/tl-p3-stream-directed.json`、`/tmp/tl-p3-ai-stream-package.json`、`/tmp/tl-p3-server-build-stream.log`及`/tmp/tl-p3-stream-*.log`，已复制至本轮产物目录。

实际执行命令为`node scripts/research-live-experiment.mjs --execute --background --history=.recovery-artifacts/research-live-experiment-20261101-resume --output=.recovery-artifacts/research-live-experiment-20261101-stream`。工作进程PID 47720，启动于2026-11-01T11:21:32.516Z；新目录封存源码、协议和输入摘要，逐请求持久保存检查点，并额外保存脱敏HTTP状态/Cloudflare Ray。机器入口已指向该目录，尚无终态时不得重复启动或关闭T15b。

## 流式终态与实际剩余范围

工作进程于2026-11-01T11:37:28.618Z保存[原终态](../../.recovery-artifacts/research-live-experiment-20261101-stream/result.json)并退出。本协议实际派发13次，前12次HTTP200，最后一次HTTP429；没有自动重试。历史7次仍计入，累计真实派发20次，不是20个完成案例。

| 案例 | 单链实际结果 | 三阶段实际结果 |
| --- | --- | --- |
| `single-price` | 完成，评分1，81,766ms | 完成，评分1，279,864ms |
| `stale-price` | 完成，评分1，42,191ms | 反证输出截断，131,458ms，评分未知 |
| `cross-symbol` | 完成，评分1，144,298ms | 反证输出截断，178,738ms，评分未知 |
| `currencies` | 预算守卫阻塞，未派发 | 综合请求被Provider拒绝，97,183ms，计量/评分未知 |
| 其余16例 | 未派发 | 未派发 |

最后请求为`cab252a4-50a7-4dc5-a8a8-bc83532d2bb3`，UTC 11:37:28.421收到HTTP429，Ray为`a53a9b8e7ba2fca7-LAX`。对应事实为`provider_rejected`、用量未知，触发`unknown_outcome`停止。旧入口只保存状态/Ray，没有保存错误子码，不能确认是每日额度、速率还是容量问题。[Cloudflare错误表](https://developers.cloudflare.com/workers-ai/platform/errors/)分别列出3036账户额度与3040容量的HTTP429，不能仅凭状态码认定应升级方案。此次控制台只读导航与页面读取均超时，没有取得账户侧信息；此前计费接口403事实保留，未调整账号或订阅。

当前两组均已派发3例，单链实派发3组全部完成；三阶段实派发4组，1组完成、2组截断、1组拒绝。有效质量配对只有1例、差异0；不足20例/20对，任何部分比率均不形成激活结论。当前继续保持单链，T15b.3和生产T16/G5仍未通过，研究Task不归档。

## 累计费用与保护复核

本协议12次有完整计量，按冻结费率估算0.09553295 USD，最后1次未知。合并历史后共17次有计量、3次未知，已记录估算0.13061760 USD；全部实际账单费用仍未知。每笔未知按完整组上限预留0.06420 USD，共0.19260 USD，累计保守占用0.32321760 USD，5 USD授权扣除后剩余估算可用4.67678240 USD。

原终态`budget.committed=0.2590176`只含此前2笔未知预留；最新429按停止规则没有再派发，第三笔未知预留由[独立部分核对](../../.recovery-artifacts/research-live-experiment-20261101-stream/partial-audit.json)补齐用于后续预算，不能把该差额当成实际收费。没有释放历史未知预留或重置额度。

[独立保护检查](../../.recovery-artifacts/research-live-experiment-20261101-stream/independent-protection.json)使用维护入口只读核对，模型请求0；正常12表、Cloudflare密文摘要/配置修订、当前目标模块及无在途AiRun与运行前一致。固定集与封存评价字节摘要保持。原实际运行的12份编译模块、入口及两份封存数据均按原摘要精确保存于`sealed-runtime/`，清单为`sealed-runtime-manifest.json`；不把本地维护修复当作正常服务已部署。

## 停止后的诊断及汇总修复

T15b.2h新增独立`research-live-experiment-http.mjs`，只从非成功响应副本提取有限整数子码及标准重试时间，不保留正文/任意消息；读取最多64 KiB、最多1秒，正常SSE不读取或复制正文，原响应仍交SDK。4项新测试加原6项Node守卫共10项通过，脚本语法、格式和文件尺寸通过。该修复没有新增模型请求，旧429子码仍未知。

T15b.2m修复部分汇总的分母：原程序的`completedCases=4`实际是遍历数量，`singleFailureRate=0.25`含第4例未派发占位。当前区分遍历4例与两组均派发3例，单链失败0/3、阶段失败3/4；同案例时延比约2.1996，实际费用比未知。这些只是部分数据。原终态保留，[单独重算](../../.recovery-artifacts/research-live-experiment-20261101-stream/partial-evaluation-recomputed.json)证明8个组记录的原封存评分均一致，没有修改评分词组或阈值，最低案例/质量/失败率/时延/费用门槛仍未通过。

本次定向42项通过，AI包749项中666通过、83跳过、0失败；Server编译、边界、文件尺寸与定向ESLint通过。日志为`/tmp/tl-p3-partial-{directed,package}.json`、`/tmp/tl-p3-partial-build-local-cli.log`及`/tmp/tl-p3-partial-*.log`。首次编译使用了不存在的根目录Nest CLI，未进入源码编译；改用Server本地已安装CLI后通过，原失败日志保留。

全仓Secret扫描首轮命中既有飞书测试的`fixture-hook-1234567890`假地址；将相同假地址改为`URL`组装，未改变测试值或真实配置。该文件8项解析/资源守卫回归通过，真实通知请求0，随后Secret扫描通过；没有放宽扫描规则。

最终78个本地文档链接有效，当前源码格式与定向差异检查通过，Secret扫描18,144个文件通过。三仓库HEAD及`git ls-files --stage -z`索引内容摘要与基线一致，均无暂存差异。首次索引核对误将该内容摘要与二进制index文件比较，原失败核对另存`post-stop-verification-initial.json`，按原登记口径修正后通过；未修改索引。完整事实见`post-stop-verification.json`。

## 接续条件

当前机器入口已标记停止，无活动实验进程，不再自动派发。需要取得上述429的错误子码及当前Workers方案/可用额度，明确可继续调用的账户条件；本次5 USD授权继续有效，不需要重复授权同一预算，也不包含自动新增订阅。

条件解除后仍须先核对当前完整终态、7个实派发组、13次新请求及历史7次，带入3笔未知和累计占用；原`--resume`只覆盖首轮`interrupted-run.json`格式，不能把本轮终态直接套入旧入口或按同协议预算历史清零重开。剩余17个单链组、16个三阶段组仍由T15b.3持有；已失败组和未知事实不因接续消失。T13c/G4b的到期/经济价格条件仍独立保留。

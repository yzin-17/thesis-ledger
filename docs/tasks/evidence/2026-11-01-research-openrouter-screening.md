# 研究OpenRouter缩减筛查接续记录

日期：2026-11-01至11-02（北京时间）。对应[研究Task](../2026-10-18-research-evidence-evolution.md)的T15b.2o/T15b.2b/T15b.2n及T15b.3，稳定边界见[Spec](../../specs/2026-10-18-research-evidence-evolution.md#p3-openrouter-screening)。[Cloudflare原结果](2026-11-01-research-live-experiment.md)独立保留。

> 当前状态：获准Nemotron五例筛查已结束，10组均尝试，6组完成/4组失败；19条生成元数据逐一核实型号、用量及合计0 USD。有效质量配对2、评分差0、配对耗时比2.1683，结论保持单链。跨Provider累计48次本地POST尝试（Cloudflare 20、OpenRouter 28），40笔有用量、8笔旧未知及原费用预留保持；不得称为48次已确认生成。详情见[筛查结果](#nemotron-screening)，当前状态由原Task维护。

## 授权与样本

用户确认Cloudflare当日用量过多，要求换到OpenRouter，随后要求“简化次数，缩减到50次以内”。首次按原20次加7例最多28次规划，预计累计48次；后续每笔失败也计入同一50次硬上限，最新累计情况见各次终态。费用仍共用累计5 USD，不重置。

OpenRouter首次调用前，固定7例：`single-price`、`stale-price`、`currencies`、`future-publication`、`adjustment-basis`、`dividend-proposal`、`prompt-injection`。每例单链1次、三阶段最多3次，失败或未知按原规则保留。原20例及评价文件字节保持，子集不按新成绩挑选。此次是缩减筛查，20例生产启用门槛保持；不能以7例声称通过该门槛。

## 固定模型与真实额度预检

现有OpenRouter正常配置只登记`openrouter/free`，已启用且研究路由存在。其配置修订为`2026-10-30T17:00:05.671Z`，凭据密文摘要为`4d6bbda8418c263192941bdcd5a9e3be877a8b4d58fefe9480e6f26c84f21f29`。不导出明文，不更改正常路由、用途、费率或默认模型。

[官方随机免费路由说明](https://openrouter.ai/docs/guides/routing/routers/free-router)明确该别名随机选择型号；本轮隔离请求因此固定`google/gemma-4-26b-a4b-it:free`，目录规范标识为`google/gemma-4-26b-a4b-it-20260403`。公开目录输入/输出费率均为0，支持`response_format`。源码只允许该型号、其省略免费后缀形式或封存规范标识，其他实际模型停止。供应商内部同型号路由仍由OpenRouter管理，客户端只提交一个固定型号，不自动重试或切换模型。

真实只读`/key`和`/credits`均HTTP200，余额0 USD、免费层，当日请求`used=0 / limit=50 / remaining=50`，足以容纳28次上限；没有充值或新增订阅。该数字是执行前快照，不推断后续请求必然可用。预检保存于`.recovery-artifacts/research-openrouter-preflight-20261101/`，模型生成请求0。端点及额度字段依据[官方限额说明](https://openrouter.ai/docs/api_reference/limits)。

## 累计预算与本地验证

递归读取旧非流式终态和后续流式终态，逐层核对文件摘要、已记录费用与实际派发数。原20次、17次有用量、3次未知全部保留；已记录估算0.13061760 USD，3笔未知按原Cloudflare费率与各组完整上限预留0.19260 USD，累计占用0.32321760 USD。新免费费率不用于释放旧预留，未知仍未知。旧Provider质量/时延不进入新模型配对。

定向测试45项通过，覆盖旧受控驱动、新7例28请求、累计48请求、50次硬上限、未知预留保留和实际SDK回环SSE费用0。维护入口15项通过，覆盖递归预算引用、篡改拒绝、模型目录、额度、官方目标、错误副本及持久检查点。AI包752项中669通过、83跳过、0失败；最终Server编译通过。原始输出为`/tmp/tl-p3-openrouter-final-directed.json`、`/tmp/tl-p3-openrouter-final-node.log`、`/tmp/tl-p3-openrouter-final-package.json`及`/tmp/tl-p3-openrouter-final-build.log`。

本地验证保留以下修正事实：初次历史测试缺少USD字段，补齐夹具后通过；新请求最初将显式推理开关放在不符合现有能力合同的位置，回环在派发前拒绝。改用现有`openai-compatible / openrouter-v1`组合并仅对OpenRouter声明关闭reasoning后，发现通用参数禁止覆盖系统`provider`字段；保持原保护，使用固定型号与现有路由能力后通过。首轮编译另有3处`exactOptionalPropertyTypes`错误，改为省略可选属性与删除测试属性后通过；未放宽类型配置。这些都是本地失败，没有消耗真实模型请求。

请求间隔使用Server已安装的`es-toolkit@1.51.0`。实际声明为`delay(ms, { signal }?): Promise<void>`，代码与[官方文档](https://es-toolkit.dev/reference/promise/delay.html)均确认支持取消。通过Server依赖解析`es-toolkit/promise`，按`await delay(remaining, { signal })`等待；选择该能力用于串行等待并保留每个请求。间隔及取消测试通过，没有安装依赖或改锁文件。

## 实际执行

首次入口为`node scripts/research-live-experiment.mjs --execute --background --provider=openrouter --history=.recovery-artifacts/research-live-experiment-20261101-stream --output=.recovery-artifacts/research-live-experiment-20261101-openrouter-7`。工作进程48432于UTC 12:19:17.654保存终态并退出；唯一模型POST为`a82abe99-5a65-40d2-a5a8-cc47865fbd30`，HTTP429、Ray `a53ad8cd8aaacf23-SJC`，计量未知，触发停止。该型号未取得质量配对，没有重发。正常12表与配置保护通过。

累计模型POST因此为21次、4笔用量未知。Gemma这笔未知按封存免费费率计算的预算预留为0，仍保留用量/实付未知，不能记作已确认免费；原Cloudflare3笔0.19260 USD预留不释放。累计保守占用仍0.32321760 USD。

随后只读`/key`返回`used=0 / limit=50 / remaining=50`；Gemma公开端点为Google AI Studio、目录状态0、近30分钟uptime=100，但不能据元数据否定真实429或确认具体原因。用户可用模型目录`/models/user`及独立Phala端点列有`xingchen-agi/xing4.0-29b-a4b:free`，规范标识`xingchen-agi/xing4.0-29b-a4b-20261015`，输入/输出0费率，支持reasoning和JSON/结构化输出。只读回执为首次目录下的`readonly-after-429.json`，模型请求0；端点接口依据[官方文档](https://openrouter.ai/docs/api/api-reference/endpoints/list-endpoints)。

本轮选择该独立固定型号重新封存同7例，不混入Gemma或Cloudflare质量结果。原21次加新28次最多49次，仍在用户50次硬上限内。维护诊断新增白名单限额来源、整数`X-RateLimit-*`头及布尔错误提示，不保存任意消息，不回填旧Gemma的缺失字段。新46项定向、16项维护测试通过；AI包753项中670通过、83跳过、0失败，Server编译通过。新入口只读预检返回7例、累计旧请求21次和0.3232176 USD预算占用，模型请求0。

## Phala请求终态与当前阻塞

第二次入口为`node scripts/research-live-experiment.mjs --execute --background --provider=openrouter --model=xingchen-agi/xing4.0-29b-a4b:free --history=.recovery-artifacts/research-live-experiment-20261101-openrouter-7 --output=.recovery-artifacts/research-live-experiment-20261101-openrouter-xingchen-7`。独立进程63022于UTC 12:27:42.205保存[终态](../../../.recovery-artifacts/research-live-experiment-20261101-openrouter-xingchen-7/result.json)并退出。

唯一新模型请求`a10cc0c6-93e6-4385-b3d4-849cb83319db`在UTC 12:27:41.996返回HTTP429，Ray `a53ae517b86ccce5-SJC`，整数子码429。没有`Retry-After`、可用限额来源或供应商子码，`X-RateLimit-*`为空，固定错误提示均未命中；因此不推断具体账户或上游根因。用量未知触发停止，三阶段未派发。两个固定免费型号均未形成有效评分配对，7例筛查未完成，生产阶段化保持未启用。

停止后[独立只读核对](../../../.recovery-artifacts/research-live-experiment-20261101-openrouter-xingchen-7/independent-after-stop.json)证明正常12表、配置、密文摘要、目标模块和无在途AiRun与运行前一致；UTC 12:36:09再次读到账户余额0 USD、免费计数0/50，模型请求0。只读模型目录和端点元数据不构成推理请求可用的证明。活动API仅支持已完成UTC日，本日查询HTTP400未用于判定凭据有效性或429原因；控制台只读页面载入超时，未更改权限、订阅或账户设置。

## 最终累计账簿与验证

[独立累计核对](../../../.recovery-artifacts/research-live-experiment-20261101-openrouter-xingchen-7/cumulative-audit.json)逐层验证4份终态及引用摘要：Cloudflare 20次、OpenRouter/Gemma 1次、OpenRouter/Xingchen 1次，共22次；17次用量已知、5次未知。累计已记录估算0.13061760 USD、未知保守预留0.19260 USD，占用0.32321760 USD；实际账单仍未知。两笔OpenRouter未知按原免费目录费率预留0，不表示已确认无收费；原Cloudflare3笔预留不释放。

剩余模型请求28次，剩余估算预算4.67678240 USD。首轮独立账簿核对错误使用金额字符串字面对比，等值金额的小数位数不同导致断言失败；改为`Decimal`数值比较后逐项一致，原终态没有修改。实际运行源码、原固定集/评价摘要均保持，12份原编译模块另存于最新产物目录的`compiled-runtime/`，没有部署正常服务。

固定付费Qwen的余额不足拒绝及足额准入又补1项维护测试，最终Node 17项通过；该测试均为本地只读API响应，不发模型请求。46项定向、AI包670通过/83跳过、Server编译及最新边界/尺寸/定向ESLint证据继续有效，运行代码输入未再改变。

## 后续执行条件

本轮五例的全部组均已尝试并终止，结论保持单链，当前没有活动实验进程。不重试失败组或补用未用位置；本轮19次、累计48次，原5 USD及50次边界保持。剩余2个保守尝试位置不表示上游已确认生成次数或免费日额度，也不构成新实验范围。

本轮预先固定的5例与独立评价保持。旧Xingchen 7例只保留历史，不混入新质量结果；补充文本/命名测试计量已核对并递归保留。生产20例启用门槛、旧失败、未知费用与费用预留保持，没有充值、订阅、凭据或全局配置操作。T15b/T15b.3完成本轮筛查与不激活决策，T16/G5不适用且未交付；研究Task的P2正向价格条件仍未完成，未归档整个Task或移动验收义务。

T15b.3仍未勾选，T16/G5未通过；不足案例、未知费用和真实Provider失败没有移入TODO或归档。

最终本地复核通过：82个相对文档链接有效，差异空白、源码格式、文件尺寸及Secret扫描通过；三仓库HEAD和`git ls-files --stage -z`索引内容摘要保持，无暂存差异。两个实际工作进程均已退出，封存源码和固定输入摘要未改变。完整核对见最新产物目录的`final-verification.json`及`final-*.log`。

## 按用户要求复核免费限制

用户要求先确认免费限制是否解除。北京时间21:20:16完成新的[只读核查](../../../.recovery-artifacts/research-live-experiment-20261101-openrouter-xingchen-7/readonly-free-recheck-2026-11-01T13-20-16-860Z.json)：`GET /key`和`GET /credits`均HTTP200，免费日计数仍为`used=0 / limit=50 / remaining=50`，余额0 USD，`limit_remaining=null`、`budgets=[]`、`effective_budget=null`。正常12表、配置、凭据密文摘要和目标模块保持一致。

[官方限额说明](https://openrouter.ai/docs/api_reference/limits)明确日计数不报告分钟限制，429也可能来自平台保护或上游容量。上述结果没有给出此前两笔429的具体原因或解除回执，因此当前只能确认日额度接口报告充足，不能确认实际推理已经恢复。本次生成请求0，累计仍22次、剩余28次；原5 USD上限与未知费用预留保持，T15b.3及生产启用门槛仍未通过。

## 保留失败终态的接续验证

为在原授权内验证实际准入，新增`--continue`入口，只读取首例单链429、三阶段未派发的完整终态。逐项核对封存协议/固定集/评价、旧进程退出、正常目标、请求审计、对应HTTP429及完整预算引用；保留失败单链原样，从三阶段开始，最多新增27次、累计49次。该入口不重做旧失败，不将其额外加入未知失败分母，也不接纳任意其他中断形态。旧中断`--resume`与跨协议`--history`保持独立；三个入口互斥。

定向49项与维护入口20项通过；AI包756项中673通过、83跳过。首次Server编译发现测试夹具使用不存在的`response`阶段，按现有枚举改为`response_headers`后，新3项测试和Server编译通过，未修改类型配置。边界、文件尺寸、workspace依赖、定向ESLint及源码格式通过。主要原始输出为`/tmp/tl-p3-continuation-{directed-final.json,node.log,package.json,build-final.log}`；旧失败日志保留，不补写为成功。

只读接续预检生成请求0，返回7例、保留1个失败组、累计22次、占用0.3232176 USD和原未知预留0.1926 USD。原20例与封存评价字节一致；当前22份源码/固定输入复制至新实验目录`source-snapshot/`并记录摘要，正常服务未部署。

## 免费路径实际复核终态

用户要求先确认免费限制后，使用同一固定`xingchen-agi/xing4.0-29b-a4b:free`及`--continue`读取原Phala首429终态，旧失败单链保持，从尚未执行的三阶段开始。工作进程64336于北京时间21:28:19.904保存[完整终态](../../../.recovery-artifacts/research-live-experiment-20261101-openrouter-free-check/result.json)并退出，新模型POST共2次：

- 首例`organize`请求`f790bddb-ef18-4ae6-b320-825e2f4be277`在21:27:47.062收到HTTP200，Ray `a53b3d1c4ecf174a-SJC`；SDK返回`schema_invalid`，用量输入4668、输出1600，封存费率估算0 USD，实际型号与实付金额未知，没有可评分输出。
- 下一案例`stale-price`的`organize`请求`eb64c0a6-b04a-4edb-9b0c-f54e4ba3bb13`在21:28:19.701收到HTTP429，Ray `a53b3de8ec08693f-LAX`，子码429，未提供`Retry-After`、可用限额来源、供应商子码或限额头；用量未知触发停止。HTTP200不能替代结构、模型身份或研究业务验收，免费路径尚未稳定恢复。

本轮同时暴露接续停止条件缺口：首个结构失败用量已知，原驱动继续了下一案例，没有满足新增接续规则的“新失败立即停止”。运行后为接续路径补上`continuation_arm_failed`，用已知用量/结构失败反例证明只派发1次且不进入下一案例；没有重写原2次记录或再次实调。最终定向50项、AI包757项中674通过/83跳过、Server编译通过。原运行22份源码及13份编译模块保持在`source-snapshot/`、`compiled-runtime/`，后续改动单独登记为`post-stop-source-manifest.json`；新验证不回填为旧运行证据。

[独立累计核账](../../../.recovery-artifacts/research-live-experiment-20261101-openrouter-free-check/cumulative-audit.json)递归核对4份预算终态及首429接续来源5个文件摘要：累计24次、18次用量已知、6次未知、0笔供应商实报费用。已记录估算仍0.13061760 USD，未知原价预留0.19260 USD，总占用0.32321760 USD；剩余累计请求26次、估算预算4.67678240 USD。没有将旧失败重新计入额外失败分母，没有释放旧Cloudflare预留。

北京时间21:29:50的[停止后只读复核](../../../.recovery-artifacts/research-live-experiment-20261101-openrouter-free-check/readonly-free-recheck-2026-11-01T13-29-50-220Z.json)显示正常12表、配置、密文摘要与目标模块保持；免费日计数`used=1 / limit=50 / remaining=49`，余额0，`budgets=[]`、`effective_budget=null`。该日计数独立于实验累计24次，不能用其49次替代用户剩余26次的硬限制。7例没有有效配对，T15b.3/T16/G5保持未通过。

停止后最终复核通过：边界、Secret扫描、定向ESLint、源码格式及文件尺寸ratchet通过，保留7项存量尺寸警告。三仓库HEAD与索引内容摘要保持；80个相对文档链接有效，差异空白检查通过，三个旧/新实验进程均退出。22份原源码副本、22份修复后源码摘要和13份实际运行编译模块逐项核对通过，独立停止后状态与运行前后正常数据完全一致；详见新实验目录`final-verification.json`及对应`/tmp/tl-p3-continuation-stop-*.log`。没有暂存、提交、推送或部署，也没有新增模型请求。

## 用户指定免费路由的单次文本测试

用户要求“你试下openrouter/free”后，仅向既有OpenRouter官方Chat Completions入口发送1次文本请求，未重试、未修改正常模型或路由。北京时间21:36:55.107收到HTTP200、Ray `a53b4a80aa6523fd-SJC`，返回`OK`，结束原因为`stop`；响应实际型号为`cohere/north-mini-code:free`，用量输入10、输出50 Token，接口回报费用0 USD。正常12表、配置、凭据密文摘要和目标模块保持。原始[测试回执](../../../.recovery-artifacts/research-openrouter-free-probe-20261101T133650659Z/result.json)与原脚本保留，该测试不作为研究案例或质量配对。

北京时间21:38:21只读目录确认实际型号规范标识`cohere/north-mini-code-20260617`、输入/输出费率0，支持参数没有`response_format`。同次只读日计数为`used=2 / limit=50 / remaining=48`、余额0，目标与测试前后相同，详见同目录`readonly-after.json`。这些元数据不将文本测试提升为结构化研究验收。

## 用户对账户日志的更正与对账缺口

用户随后明确反馈“这次才是第一次，刚才没收到请求日志”。因此OpenRouter账户可见记录按用户反馈记为1条；Agent没有逐条读取账户控制台确认，不把此前本地尝试当作账户已确认生成。

本地记录分别为Gemma 1次HTTP429、Phala/Xingchen首轮1次HTTP429、Phala接续2次HTTP200/结构失败及HTTP429，以及本次免费路由1次HTTP200/返回OK，共5次OpenRouter POST尝试。原Cloudflare本地20次独立保留，跨Provider尝试合计25。此前“累计模型请求”的用词混淆了本地派发与上游生成，当前口径已更正；旧回执原样保留，不能据日志缺失推断从未发起过网络尝试，也不能据本地回执推断已进入账户生成日志。

四轮本地回执绑定同一OpenRouter配置修订与凭据密文摘要，但没有保存可用于逐条查账的OpenRouter生成ID；本地UUID和Cloudflare Ray都不是该ID。[官方生成元数据接口](https://openrouter.ai/docs/api/api-reference/generations/get-generation)按生成ID读取记录。当前无法把旧回执与账户日志逐条匹配，不能补造ID、推断旧429具体发生位置，或将只读日计数2直接写成已确认2次生成。用户可见1条与接口计数2的差异保持未解释。

[对账更正记录](../../../.recovery-artifacts/research-openrouter-free-probe-20261101T133650659Z/account-log-reconciliation.json)分别保存用户反馈、5次OpenRouter本地尝试、跨Provider 25次尝试及API日计数。已记录费用估算0.13061760 USD、旧未知预留0.19260 USD均保持；本次接口实报0 USD独立记录，不解除旧未知。当前沿既有尝试口径保守保护剩余25个位置，不将其当作账户剩余生成次数；后续须先合并单次路由测试计量并保存/对账上游生成ID。此次更正没有新增任何模型请求。

## 按原7例接续的实施准备

用户要求“按原计划继续实施”后，原7例和固定结构化型号保持。合并24次完整终态与1次单独文本测试的补充预算；只接受摘要、累计起点、完整用量和供应商实报0费用均一致的免费单次成功回执。该次只进入预算，不进入质量评分；再次接续及跨协议历史读取也必须计入，当前账本未合并全部尝试时维护入口拒绝派发。

新增`--continue-terminal`读取多组完整终态，递归验证原接续来源摘要、请求审计、HTTP回执、旧进程退出、组序列和费用；失败仅支持当前已核对的首次`provider_rejected/schema_invalid`形态，完成组重新核验产物和评分后复用。原3个尝试组保持，未派发部分最多新增21次，保守累计最多46次；新失败立即停止，不重做原失败。正常研究策略、Provider配置与目标数据库保持。

新增有限响应观察器与维护传输，记录OpenRouter `gen-`生成ID和实际型号；普通JSON与跨分片SSE均保持原响应字节及取消，不记录正文。缺失/超限明确状态，不将本地UUID、上游`chatcmpl`或Cloudflare Ray填为OpenRouter生成ID。此诊断不改变评分，不新增请求或客户端重试。

本地验证54项定向、31项维护入口通过；AI包761项中678通过、83跳过、0失败，Server编译通过。边界、文件尺寸ratchet（保留7项存量警告）、workspace依赖图（8包）、Secret扫描、定向ESLint与格式通过。原始输出为`/tmp/tl-p3-terminal-{directed.json,node-final.log,package.json,build.log}`及同前缀门禁日志。原20例/评价字节与旧运行快照保持，当前35份源码/固定输入封存于新实验目录；正常服务未部署。

只读预检命令使用原固定`xingchen-agi/xing4.0-29b-a4b:free`、`--continue-terminal=.recovery-artifacts/research-live-experiment-20261101-openrouter-free-check`，返回7例、复用3组、初始化25次、占用0.3232176 USD/未知预留0.1926 USD，生成请求0。预检目录为`.recovery-artifacts/research-openrouter-terminal-preflight-20261101/`。真实执行仍由T15b.3验收，文本路由成功不替代本轮结构化请求。

## 实际接续及Schema失败的只读核实

多组接续工作进程21635只新增1次，从`stale-price`单链开始，于北京时间22:01:18.889保存[终态](../../../.recovery-artifacts/research-live-experiment-20261101-openrouter-terminal/result.json)退出，正常数据/配置保护通过。HTTP200在22:00:53.138返回，Ray `a53b6d991de1586f-SJC`，本地UUID `771bbc69-88cd-409f-ae3f-6314b96977ce`，上游生成ID `gen-1793541651-sMh89yLPEDHpVnGnvdjb`。SDK用量完整，但输出`schema_invalid`，按默认停止策略终止后续组；本地累计26次，旧4个尝试组保持。

只读[生成元数据](../../../.recovery-artifacts/research-live-experiment-20261101-openrouter-terminal/generation-metadata.json)按该ID返回HTTP200：固定规范型号`xingchen-agi/xing4.0-29b-a4b-20261015:free`、Phala、正常结束，原生输入4682/输出1506 Token，总费用0 USD。存储完成内容为3768字符，JSON合法对象，但同一研究Schema独立复验有9项违规：`instrumentId`格式、额外字段及`nextSteps.claimId`缺失。只留SHA-256、脱敏结构和错误路径，未保存原正文；见同目录`stored-content-readonly.json`、`stored-schema-analysis.json`。元数据流超过64KiB观察上限时ID已保留，原响应继续完整传给SDK；存储内容独立验证了实际Schema违规，不据HTTP200推定研究成功。

该上游ID已从官方生成元数据独立核实，与此前本地UUID及历史账户可见日志分列。旧账户首条日志仍仅标为用户当时反馈，未推算当前控制台总条数；本轮费用实报0也不解除旧Cloudflare未知预留。

## 可核实Schema负样本的组间继续策略

在确认完整产物确实违反Schema后，为完成原7例筛查，新增显式`--continue-confirmed-schema-failures`策略。每条新Schema失败须同时通过上游生成ID、固定型号、正常结束、与SDK一致的完整用量、实报0费用和存储完成内容的Schema失败核对，才作为负样本结束本组、继续其他零派发组；该组不重做、不修补产物、无评分。缺失、读取失败、任何不一致、JSON无法核实或本地/上游Schema结论冲突均全局停止，HTTP429、未知消耗及其它失败仍全局停止。原消息、Schema、20例/7例和封存评价保持。

57项定向、34项维护入口通过，含全部负样本仍无分数/有效质量配对、各种伪确认拒绝、未知错误不进入确认器等反例。AI包764项中681通过、83跳过、0失败，Server编译及必要门禁通过，保留7项存量尺寸警告；原始输出为`/tmp/tl-p3-confirmed-{directed.json,node-final.log,package.json,build.log}`及同前缀门禁。旧实际运行15个编译模块已独立封存，原回执保持。

对刚才已停止生成的只读确认器返回正向（生成请求0），完整字段见同目录`posthoc-policy-confirmation.json`，只代表该条已核实失败。新预检显式封存`continue_confirmed_schema_failures_v1`，复用4组，累计起点26次、占用0.3232176 USD/未知预留0.1926 USD；实际最多新增20次、累计不超过46次。新源码/固定输入39份另存于下一实验目录，预检目录`.recovery-artifacts/research-openrouter-confirmed-preflight-20261101/`，未部署正常服务。

## 最新接续的HTTP429终态与后续边界

显式负样本策略工作进程58182从`currencies`尚未执行的单链开始，仅新增1次本地POST。北京时间22:22:27.497返回HTTP429，Ray `a53b8d395a1deb2a-SJC`，本地UUID `2cc92aa5-856c-4f8e-972b-567e407249bb`；没有上游生成ID或用量，也未提供可用子原因、`Retry-After`、限额来源/头或供应商子码。该结果未进入Schema确认器，按未知结果全局停止，没有继续其它组或重发旧失败。[完整终态](../../../.recovery-artifacts/research-live-experiment-20261101-openrouter-confirmed/result.json)于22:22:27.718保存，工作进程已退出，正常数据/配置保护通过。

[独立累计核账](../../../.recovery-artifacts/research-live-experiment-20261101-openrouter-confirmed/cumulative-audit.json)重新核对4份预算终态、3份同协议接续来源及全部来源摘要，原保留组逐项一致。累计本地尝试27次、用量已知20次/未知7次，补充文本测试只计1次。已记录已知/估算费用0.13061760 USD、原未知预留0.19260 USD、保守占用0.32321760 USD；剩余估算预算4.67678240 USD。最新免费未知按原0费率预留不等于实付已确认0，旧Cloudflare预留没有释放。

22:24:54停止后只读`/key`与`/credits`均HTTP200：免费日计数`used=3 / limit=50 / remaining=47`，余额0、无额外预算限制。该日计数不代替本地尝试口径下的23个剩余位置，也不代替账户日志条数。正常12表、配置、密文摘要和目标模块保持；回执为最新目录`readonly-free-recheck-2026-11-01T14-24-54-424Z.json`。该次本地自动回执未识别具体限流来源；后续用户控制台截图对同型号路径补充了Phala上游限流，逐条请求关联仍未核实。

本轮共新增2次本地POST，只有先前1条取得生成ID并经官方元数据确认；最新1次没有ID，保持未知。原7例中2例两组已尝试，第3例单链已尝试，仍无有效质量配对；不把这些计数写成成功业务验收。39份实际源码/固定输入与16份运行编译模块封存，未修改正常服务。T15b.3仍未勾选，T16/G5保持未激活、未交付；没有移入TODO或归档。

最终一致性复核通过：39份源码及副本、16份实际编译模块摘要一致，86个相对文档链接有效，差异空白检查及最终Secret扫描通过；新旧5个实验进程均退出。独立只读状态与运行前后正常数据完全一致，三仓库HEAD及索引内容摘要保持，没有暂存、提交、推送或部署。最新目录`final-verification.json`记录复核，`checks-summary.json`保存验证命令、工作目录、输入清单与日志摘要。原5 USD/50次授权保持，待同一固定型号可用条件恢复后最多新增19次即可覆盖剩余零派发范围，不需要重做旧组或重置预算。

## 用户控制台截图补齐限流来源

用户随后提供的[原始截图](../../../.recovery-artifacts/research-live-experiment-20261101-openrouter-confirmed/user-phala-upstream-429.png)显示HTTP429、供应商Phala，并明确说明`xingchen-agi/xing4.0-29b-a4b:free`正被上游暂时限流。因此可以确认图示错误的来源为该型号的Phala供应商侧临时限流，不能将这条提示解释为OpenRouter日额度耗尽。

截图未显示请求/生成ID、时间或恢复期限，不能与某一条本地429逐条绑定，也不能据此确认限制已解除。原本地回执缺失的字段保持，不回填上游子码、生成ID或费用。截图字节及SHA-256保存在最新目录，结构化观察见同目录`user-phala-upstream-429.json`；图中的重试/接入密钥提示仅是原始错误资料，没有据此发起模型请求或账户变更。本次新增模型请求0，本地累计仍27次，原预算及7笔未知计量保持。

## 用户明确要求再次尝试的结果

用户随后要求“再试试看”。源码39份及编译模块16份逐项摘要保持，复用原57项定向、34项维护入口、AI包681通过/83跳过与编译/门禁证据，未重复构建或改变原模型/消息。新只读预检复用5组、初始化27次，原占用0.3232176 USD/未知预留0.1926 USD保持，生成请求0；目录为`.recovery-artifacts/research-openrouter-retry-preflight-20261101-153619/`。

工作进程83781从`currencies`三阶段的`organize`开始，仅新增1次本地POST，于北京时间23:38:27.549收到HTTP429，Ray `a53bfc84ffde67fb-SJC`，本地UUID `e784fdf6-6c41-44ce-a789-535130baeea6`；响应体诊断不可用，未取得生成ID、用量、错误子码、`Retry-After`或限额头。未进入Schema负样本确认器，没有重发任何旧组。23:38:28.804保存[终态](../../../.recovery-artifacts/research-live-experiment-20261101-openrouter-retry-153619/result.json)并退出，正常数据/配置保护通过。

新[独立核账](../../../.recovery-artifacts/research-live-experiment-20261101-openrouter-retry-153619/cumulative-audit.json)核对4份预算终态及4份同协议接续来源：本地尝试28次，用量已知20次/未知8次，原组与补充文本测试计量保持。已记录已知/估算0.13061760 USD、原未知预留0.19260 USD、保守占用0.32321760 USD，剩余估算预算4.67678240 USD；不能将未知免费请求计为已确认0费用。

停止后独立只读目标与运行前后完全一致，39份源码和16份编译模块另存于本轮目录。原7例中3例两组已尝试，有效质量配对0，仍未满足真实筛查完成条件；T15b.3保持未勾选。剩余4例最多新增16次，保守剩余22个尝试位置足够，原5 USD/50次授权保持，不自动重发或切换型号。

<a id="nemotron-probe"></a>

## 11月2日：用户指定Nemotron单次测试

用户要求“再试试Nemotron 3.5 Super VL”。先通过现有凭据只读核对目录，选择`nvidia/nemotron-3.5-super-vl:free`，规范标识`nvidia/nemotron-3.5-super-vl-20261015`，目录输入/输出费率均0，支持`response_format`、`structured_outputs`及关闭reasoning。没有修改正常`openrouter/free`配置或凭据。

本次仅1次POST，使用独立小型Schema约束`{"ok":true}`、128输出Token上限、关闭reasoning、要求参数支持、禁止供应商回退，客户端重试0。派发前预记第29次本地尝试。北京时间00:01:53.363收到HTTP200，Ray `a53c1edd9f08d81b-SJC`，实际型号`nvidia/nemotron-3.5-super-vl:free`、`finish_reason=stop`，合法JSON与本次小型Schema均通过。生成ID为`gen-1793548912-I31g69sXWRHAWSXulH1g`，用量输入30/输出6，响应实报费用0 USD。原始结果及请求封存见[单次测试回执](../../../.recovery-artifacts/research-openrouter-nemotron-probe-20261101T160147286Z/result.json)及同目录`sealed-request.json`、`dispatching.json`和`probe-script.mjs`。

紧接响应的元数据读取未成功确认，原`result.json`保留`generationMetadataConfirmed=false`。稍后只读`GET /generation`取得HTTP200，返回同一ID、规范型号带`:free`、供应商`Nvidia`、正常结束及费用0 USD；原生用量30/6与响应一致，归一化用量16/3独立保留。[后续只读回执](../../../.recovery-artifacts/research-openrouter-nemotron-probe-20261101T160147286Z/readonly-after-probe.json)据此确认本次生成，不重写早先结果。同期`/key`报告日计数4/50、剩46，余额0 USD；这些数不作为账户控制台可见日志条数。当前按生成ID核实过2笔，早先无ID记录与用户当时反馈的1条日志仍各保留来源。

本次命名测试的完整计量由独立helper接入既有补充账本；同时核对原封存起点、固定型号/Schema、结果摘要和只读确认摘要，后续历史读取保留确认摘要。漂移、缺失、未知费用/用量和重复均拒绝，不把成功测试加入研究评分。维护入口36项通过，边界、尺寸及格式通过；7项存量尺寸警告保持。实际只读终态校验保留原6个已尝试组，精确初始化29次、占用0.3232176 USD、未知预留0.1926 USD，未新增模型请求；见[累计核账](../../../.recovery-artifacts/research-openrouter-nemotron-probe-20261101T160147286Z/cumulative-audit.json)。本地验证日志为`/tmp/tl-p3-nemotron-{node,boundary,size,format}.log`，改动后的3份维护源码已复制至同目录`post-probe-source/`并登记摘要。Server/SDK/协议和编译模块未改，不重复其既有包级测试或构建。

草案校验最初误用案例字段`caseId`而非实际`id`，在预算只读核账已通过后失败，未产生模型请求或发布草案。核对固定集真实字段后，仅完成草案保存与累计指针更新；未重跑模型，也未改变原输入文件。

累计现29次本地POST尝试（21笔有用量、8笔未知），保守剩余21个位置。已记录已知/估算0.13061760 USD、旧未知预留0.19260 USD、保守占用0.32321760 USD保持；本次响应与生成元数据均确认费用0，不推断早先未知费用为0。正常12表、配置、凭据密文摘要与目标模块前后独立核对一致，没有业务写入或部署。

本次仅证明该免费型号在当时能够完成小型结构化请求，没有运行原研究Schema、冻结研究输入、单链/三阶段质量配对、时延或费用比较。原7例T15b.3保持未完成，T16/G5未激活。新型号重跑同7例最多28次，超过当前21个位置，不能直接启动；已准备[5例筛查草案](../../../.recovery-artifacts/research-openrouter-nemotron-probe-20261101T160147286Z/proposed-screening-scope.json)，预先选定价格、币种、披露截止、分红和资料注入5例，最多新增20次、累计49次。范围尚待用户确认，旧7例不因此标记完成，原20例生产启用门槛保持。

<a id="nemotron-screening"></a>

## 11月2日：获准Nemotron独立五例筛查

用户已选择“改为5例Nemotron筛查”，本次固定5例及顺序，不按新成绩挑选；旧型号7例保留历史，不计新质量结果。最多新增20次、累计49次，原50次/5 USD边界、20例生产启用门槛、原20例/评价文件与研究Schema保持。实际范围封存于[授权范围](../../../.recovery-artifacts/research-live-experiment-20261102-openrouter-nemotron-five/approved-scope.json)。

本地补齐固定Nemotron身份与5例合同、20次目录额度检查；跨型号启动将旧28次终态与尚未覆盖的命名测试1次合并为29次，旧文本测试已覆盖，不重复计入。报告保留新补充来源摘要，后续历史读取递归核对；新型号首轮与接续均执行既定失败策略，只有逐条只读核实的Schema负样本允许继续其它零派发组，失败无评分且不重试。

41项定向及38项维护入口通过，覆盖完整5例20次止于累计49次、无旧组复用、保留原费用/未知预留、案例/身份/额度漂移、重复计量、头寸不足及首轮停止规则。AI包769项中686通过、83跳过、0失败，Server编译及定向ESLint、边界、尺寸和格式通过；7项存量尺寸警告保持。验证命令输出已复制到本轮目录`check-*`，摘要登记于`checks-summary.json`。实际执行源码42份、编译模块16份另存并登记摘要；没有部署正常服务。

北京时间13:00:44的零请求预检通过：固定Nemotron免费型号、5例、20次上限，账户免费日计数0/50、余额0 USD；初始化29次、占用0.3232176 USD、未知预留0.1926 USD，复用旧组0。详见[预检封存](../../../.recovery-artifacts/research-live-experiment-20261102-openrouter-nemotron-five-preflight/sealed-inputs.json)及同目录`openrouter-model.json`。该额度快照不作为模型必然可用或账户日志条数证明，真实对照另行记录。

首轮工作进程11137实际新增9次，价格及币种两例的单链/三阶段均完成，评分均1；第三例披露截止的单链`schema_invalid`，当次生成元数据HTTP404，按规则停止，累计38次。原[首轮终态](../../../.recovery-artifacts/research-live-experiment-20261102-openrouter-nemotron-five/result.json)及404回执保留。后续只读元数据/内容HTTP200确认同一生成ID、固定型号、完整用量和0费用，完整JSON存在3项Schema额外字段违规；[事后确认](../../../.recovery-artifacts/research-live-experiment-20261102-openrouter-nemotron-five/posthoc-policy-confirmation.json)符合既定负样本策略，生成请求0，不重写原失败或补评分。

其后只读预检保留5个已尝试组，初始化38次；工作进程19883只接续零派发组，新增6次。披露截止三阶段完成；分红组三次请求的前两段核验通过，末段`synthesize`报`schema_invalid`，当次只读确认未满足，停止于累计44次。原[接续终态](../../../.recovery-artifacts/research-live-experiment-20261102-openrouter-nemotron-five-continuation/result.json)与运行42份源码/16份编译模块保持；末次随后经[事后只读确认](../../../.recovery-artifacts/research-live-experiment-20261102-openrouter-nemotron-five-continuation/posthoc-policy-confirmation.json)核实同一ID、型号、完整JSON、Schema失败和0费用。两笔事后确认均未新增生成请求。

该真实三段失败暴露终态入口只接受首段失败的局限。T15b.2t在既有模块内补齐前序输出保留：从原封存审计提取、核对指纹，并重验完整研究Schema、引用及数值；缺失、重复、多余、错误阶段/型号/用量/费用、内容漂移或多段未知失败拒绝。整组三次请求和空评分保持，不从末段恢复，只执行其它零派发组。未改变消息、研究Schema、案例、评价或停止门槛。

新43项定向与39项维护入口通过，AI包771项中688通过、83跳过、0失败。ESLint发现不必要的非空断言，移除后通过；Server编译发现测试夹具显式`history: undefined`不满足`exactOptionalPropertyTypes`，改为删除可选属性，未放宽类型选项。相关6项最终复验、Server编译与定向ESLint/格式通过；边界、尺寸通过，存量7项警告保持。原失败日志和修正后的结果独立保存于`/tmp/tl-p3-retained-stage-*`，将在后续运行目录封存；原首轮/接续运行模块不回填新版本。

补齐后的零请求预检通过：重新验证分红前两段的原始中间输出、精确保留7个已尝试组，初始化44次、占用0.3232176 USD、未知预留0.1926 USD。此时剩余分红单链及资料注入两组最多5次，旧失败不重做。

第三轮工作进程39365新增2次：分红单链完成，资料注入单链`schema_invalid`，再次按当次未满足的只读确认条件停止于累计46次。该条后续只读确认完整JSON、Schema失败、同一型号/用量及0费用；[原终态](../../../.recovery-artifacts/research-live-experiment-20261102-openrouter-nemotron-five-finish/result.json)与[事后确认](../../../.recovery-artifacts/research-live-experiment-20261102-openrouter-nemotron-five-finish/posthoc-policy-confirmation.json)独立保留。

最后零请求预检保留9组、初始化46次，源码43份与编译模块16份和上轮一致，复用已通过检查。工作进程45773仅执行最后资料注入三阶段组，新2次；`organize`通过，`challenge`达到其2240输出Token上限，实报输出2240、元数据`finish_reason=length`，SDK报`output_truncated`并停止，`synthesize`未派发。全部5例的两组均已尝试；4个工作进程共9+6+2+2=19次，没有重试、替代型号或为用满20次而补发。见[最终原始终态](../../../.recovery-artifacts/research-live-experiment-20261102-openrouter-nemotron-five-final/result.json)。

### 本轮结果与启用结论

| 预定案例 | 单链结果/评分 | 三阶段结果/评分 | 单链耗时 | 三阶段耗时 |
| --- | --- | --- | --- | --- |
| 价格 | 完成，1 | 完成，1 | 10.925秒 | 32.169秒 |
| 币种 | 完成，1 | 完成，1 | 9.781秒 | 25.926秒 |
| 披露截止 | Schema失败，无评分 | 完成，1 | 13.270秒 | 27.448秒 |
| 分红 | 完成，1 | 末段Schema失败，无评分 | 18.068秒 | 28.019秒 |
| 资料注入 | Schema失败，无评分 | challenge输出截断，无评分 | 19.500秒 | 41.564秒 |

10组中6组完成、4组失败，两组失败率均40%；缺失评分不补0，只有价格及币种形成2个有效质量配对，评分差0。按原评价口径，两组均派发案例的配对耗时比为2.168260091691826；关键违规0。原20例最低样本数、质量和时延条件未满足，结论`keep_single`。这些是人工领域基准的真实模型筛查，不代表真实行情、经济收益或20例生产启用验收。T15b/T15b.3完成本轮获准范围和决策，生产阶段化不启用，T16/G5仍不适用且未交付。

19次生成ID全部保留，后续仅通过只读元数据逐条核对身份及原生或归一化用量，全部HTTP200、同一固定Nemotron型号、费用0 USD；18条正常结束、最后1条`length`。单链5次、三阶段14次，本轮合计0 USD，见[生成与费用对账](../../../.recovery-artifacts/research-live-experiment-20261102-openrouter-nemotron-five-final/generation-reconciliation.json)。失败SDK回执原本没有实报费用，原始评价的`actualCostComplete=false`、`costRatio=null`保持，元数据费用对账单独留存，不回填原报告或据此宣称启用门槛通过。

[独立Decimal核账](../../../.recovery-artifacts/research-live-experiment-20261102-openrouter-nemotron-five-final/cumulative-audit.json)核对5份预算终态、3层同协议接续及2笔补充测试，确认原组/失败/评分保持。累计48次本地尝试，40笔有用量、8笔旧未知；已记录已知/估算0.13061760 USD、原未知预留0.19260 USD、保守占用0.32321760 USD，剩余估算预算4.67678240 USD。本轮19次的0费用有元数据依据，未将早先未知费用补0或释放预留。核账脚本保存在本轮目录`independent-ledger-audit.py`；新脚本还修正了旧辅助脚本临时变量重名导致的报告路径标签错误，旧数值及原审计回执未改。

北京时间13:26:44只读账户回执显示当日已用19/50、剩31、余额0 USD，见[费用与保护反读](../../../.recovery-artifacts/research-live-experiment-20261102-openrouter-nemotron-five-final/posthoc-cost-and-state.json)。该日计数、累计48次本地尝试、当前按ID核实过的21笔历史生成及用户此前反馈的1条控制台日志各有不同来源，不相互替代，也不声称已逐条读取控制台全部日志。正常12表、配置、凭据密文摘要及目标模块保护通过；所有工作进程已停止，没有业务写入、生产部署或路由变更。

本轮最终一致性复核覆盖固定型号/案例/评价、共享Token与次数/费用边界、三笔Schema负样本及末次截断、历史/补充预算、前序中间输出核验、源代码/编译模块与真实结果版本、正常状态保护及RA12门禁映射。结论仅为获准五例筛查与不激活决策通过；没有放宽研究Schema、填补失败评分、把人工基准当行情收益或把实验当产品交付。P2正向价格条件仍由原叶持有，未新增TODO或归档整个Task，未暂存/提交。最终文档链接、源码/运行快照与三仓HEAD/索引检查见本轮目录`final-verification.json`。

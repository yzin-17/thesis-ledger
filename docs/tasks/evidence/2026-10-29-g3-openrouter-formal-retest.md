# G3：OpenRouter/free正式业务复测

> 本次验收通过：正式报告、原数字／范围／引用校验、真实上游／SDK／数据库正文及容器重建反读一致。模型仅派发1次，费用实际为0；V2保持开启，默认仍为OpenRouter/free。

## 授权与边界

用户明确要求“也测试下OpenRouter/free的G3”。本次执行1次正式V2业务提交，唯一应用路由为当前默认openrouter/free；零费用、失败即停，不复用旧冻结预算，不测试GLM或切到Cloudflare。保留报告、失败审计与trace，保留当前V2开启状态及原默认、配置、凭据、业务数据和WIP，不stage或commit。

## 输入与预检

沿用现行研究V2合同、recent-changes问题、模拟模式和独立标的600519.SH；本次重新准备材料，不声称与D58是同一冻结快照。目标双角色仍为已验镜像1654b11a1f4b…，服务健康，Schema head保持，活动研究与回测均0，canCreate=true。当前默认修订7，研究V2用途就绪且已有用途验证；配置输入／输出单价为0 USD。OpenRouter[官方路由页](https://openrouter.ai/openrouter/free)说明只选择免费模型且输入／输出价格为零。

本轮验证现有native_schema路由，不改变输出模式、reasoning或模型请求参数；实际出站字段由trace反读，系统原预算与上游实际参数分别记录。当前路由没有requestOptions覆盖；本次不新增上限或供应商专属适配。冻结路由选择代码对明确默认只返回一条应用路由，SDK重试0；OpenRouter内部可能在免费供应商之间路由，实际模型与generation ID按响应记录。

## 验收步骤

- [x] 正式提交、实际派发与终态：最多1次SDK请求，保存真实模型／原始响应及失败事实。
- [x] 原生成／数字／范围校验、真实工具绑定、报告／引用／历史API与trace反读。
- [x] 通过后经infra正式入口复用当前镜像重建，核对报告与trace持久化；失败保持未通过并保存证据，不重复调用。
- [x] 原配置／开关／旧数据与WIP保护、调用数量及最终Review。

下列执行过程均有独立证据。私有证据包为.recovery-artifacts/g3-d59-openrouter-formal-20261029T141350Z/，预检和原现场摘要已保存。


## 材料门禁与限定续验

首次正式HTTP提交在模型调用前返回400／RESEARCH_REQUIRED_EVIDENCE_UNAVAILABLE，reasons为news_empty_or_unavailable／news_not_admitted；AiRun仍14、AiToolCall仍154，原submission无记录、没有模型派发或trace。只读核实原hithink／hithink-news-stock-timeline／600519.SH准入已于北京时间2026-10-29 14:40:47到期，D58验收在其到期前；本次未归为OpenRouter失败。

用户随后明确授权仅重新验证原同花顺新闻源、600519.SH、最近七日材料，准入有效期一小时。先按[限时续验Spec](../../specs/2026-10-29-news-admission-renewal.md)补齐原维护入口；Node参数／打包11项、真实隔离SQLite续验5项、原日期扩展6项、原解析11项共33项通过，Python关键lint通过。初次两种Python环境分别缺pandas和requests，最终用已配置的Python3.12与原DSA venv依赖通过，不修改依赖或锁文件。

单页实读同花顺返回200、10条元数据；原正式nvidia-news-admission.mjs完成plan／apply／verify，仅更新该新闻准入2→3，范围2026-10-22～2026-10-29，有效期截至北京时间2026-10-29 23:31:34。旧证据链保留，其他8条准入及政策历史／当前状态／Provider配置整表摘要一致，原路由启停和凭据保持。实现任务见[已完成记录](../../archive/tasks/2026-10-29-news-admission-renewal.md)。

## 正式单次结果

沿用原submissionId重提后准备成功，模型本轮唯一派发。runId为e55cf8da-a0db-4617-80ff-350111e804e6，traceId为1dcf789a-b16f-4257-9126-2cef17504f38，执行attempt=1，81.568秒succeeded；输入9125／输出9155 token，实际上游usage.cost和upstream_inference_cost均0，业务cost亦0。

请求的模型为openrouter/free，实际由Nvidia处理，返回model为nvidia/nemotron-3.5-super-vl:free；generation ID为gen-1793284339-s70UJeXYBFHkpg0U3row。原native_schema路径生效：stream=true、response_format=json_schema、strict=true、provider.require_parameters=true；stop和reasoning均未显式设置，实际max_tokens=10000由既有冻结预算分配，本轮未修改此配置，不误写成“没有输出上限”。上游报告reasoning_tokens=6716，其余为实际完成输出；本次保留原reasoning行为，不据此回填历史两字符的内部原因。

2029个实际响应payload、无非法JSON帧，客户端DONE完整，兼容流包含两条stop。组装正文3881字符；上游正文、SDK保存正文及落库inference逐值一致，正文SHA256为d61a307baee45fa3343dfeed2165ba268adde632b7ce6b3376ac5e8e178e63d7。原生成Zod、冻结完整性、严格数字校验和范围关联再次独立通过，2条claims／5条numericClaims，11条绑定与同run实际AiToolCall的ID、证据指纹、来源一致。

## 读取与重建

报告详情、当前模拟范围历史及11条材料API全部200，历史含本次报告；实际API响应经现行客户端共享Schema消费通过。trace为complete、issues为空，17份制品与7个成功节点均可读取。Web组件及镜像输入与D58相同，本轮没有新增浏览器或设备取证，不把API验证写成新增UI验收。

经/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra的./scripts/update.sh thesis-ledger正式重建，DEV_DATABASE_MODE=check、REUSE_THESIS_LEDGER_IMAGE_ID=sha256:1654b11a1f4b39c94bfff670dec539b46e373af427cd8ea14c88da80a3622b45，22:39:09～22:39:19退出0。双角色复用原镜像和挂载，未构建或清库；其他容器ID保持。全新进程读取17份trace、报告／历史／11材料与重建前深度一致，原submission找回为succeeded／reused=true，没有再次派发模型。

## 保护与结论

39张记录表的全部原行保持，仅新增1条AiRun与11条AiToolCall；原Cloudflare/Qwen报告未变。Provider配置／凭据、默认openrouter/free及修订7保持；.env摘要不变，研究执行true／V2 true／策略AI true保持，canCreate=true，无活动研究和回测。模型请求事实仅1条completed，未调用GLM、未修改应用源码、Schema或依赖。

当前OpenRouter/free正式单次路径通过；报告资料仍partial，结构化数字与引用验收不等于所有自由文本推断已被独立证实。免费路由可选择其他模型，本次证据只覆盖上述实际返回；旧失败请求和D41双模型推广条件保持各自事实。新闻准入仅续一小时，不自动续约。WIP最终核对结果见私有workspace-protection.json。

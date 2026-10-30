# G3 D45：绕过SDK的直接HTTP对照

对应[超时治理Task T5](../2026-10-25-ai-adaptive-execution.md)，沿用[D44](2026-10-29-g3-qwen-extended-timeout.md)同一Cloudflare/Qwen候选及冻结请求。本次只验证直接HTTP返回，不代收正式G3或候选推广。

## 授权与对照边界

用户要求“你不通过SDK，直接发请求看看”。本次新增最多1次、零费用、失败即停，沿用已确认Workers Free超额拒绝边界；旧GLM冻结1次保持。不开启Provider或V2，不改默认配置、业务数据及原验收包，不stage／commit。

使用系统curl直接POST，不加载或执行AI SDK。模型固定@cf/qwen/qwen3.8-27b，正文继续22515字节、SHA256为e59d3ebca9ab2ccbdd2d59e02e2195cbe09f264d2c2178e116258a4ce13f4987；不添加token上限、stop或思考参数，严格2020-12候选保持。总预算1200秒，内含收尾5秒、首有效输出120秒、有效进展空闲60秒，HTTP重试0、不跟随重定向。

客户端改为curl，User-Agent相应改为curl/8.7.1；正文、认证账户、Content-Type和三个网关日志头保持。curl显式禁用.curlrc，只沿用当前环境代理，不修改代理或证书设置。Authorization经标准输入传给curl，不放入进程参数或文件。

原始响应字节在内存中统计并计算SHA256；依据现有不保存原始思考文本的约束，只把逐帧脱敏副本及未改写的研究正文写入私有目录。不会补造finish_reason／[DONE]或修复JSON。诊断记录位于.recovery-artifacts/g3-d45-direct-http-20261029/。

## 当前结果与归因

本机受控HTTP流通过：curl实际发送的正文与候选逐字节相等，原fixture正文相等，终止帧与[DONE]均识别成功，思考文本脱敏验证通过，外部模型调用0。2026-10-29 01:23:27（北京时间），curl只读反读D44同账户网关日志成功，模型一致；预检不调用模型。

唯一真实请求已执行并失败停止。curl直接收到HTTP200／完整传输EOF，但没有有效研究正文或正常SSE终态；本次没有执行SDK，仍复现约300秒后缺终态的现象。Cloudflare完整存档与客户端逐帧投影及正文一致。不能再将本次问题归为SDK解析或SDK丢失正文；也不能把HTTP200／curl退出0当作模型成功。

网关记录没有内部错误码、取消原因或具体超时组件。本次进一步支持“Cloudflare侧在约300秒结束流”的判断，但不能据此确认是网关、Workers AI推理服务、模型后端的哪一个内部期限，也不能宣称官方固定上限已被证实。

| 对照 | 客户端总预算 | 网关duration | 正文 | 协议结果 |
| --- | --- | --- | --- | --- |
| D43：SDK | 600秒 | 300090ms | 7665字节，JSON截断 | 无结束原因／DONE |
| D44：SDK | 1200秒 | 300224ms | 3580字节，JSON截断 | 无结束原因／DONE |
| D45：curl | 1200秒 | 300266ms | 0字节 | 无结束原因／DONE |

三次使用相同冻结请求正文，采样结果独立；D45仅替换客户端及其User-Agent／默认Accept，未改变业务请求字段。本次不能证明调整思考参数或Schema必然修复问题，未继续派发。

## 实际派发与响应

本次控制台可按北京时间2026-10-29 01:23:50附近、模型@cf/qwen/qwen3.8-27b及User-Agent curl/8.7.1查找。

| 项目 | 实际结果 |
| --- | --- |
| 网关日志ID | 01a1838a-2a13-70bf-8155-8fe1e6e6c321 |
| cf-ray | a51ba17ca9b0a2f1-SIN |
| 开始／HTTP响应头 | 01:23:50.552／01:23:53.507 |
| 首有效输出／最后有效输出 | 01:23:55.708／01:28:52.987，均为思考增量 |
| 结束／客户端耗时 | 01:28:55.866／305.311秒 |
| curl结果 | 退出0、stderr为空、HTTP200，EOF前未触发首输出／空闲／总预算 |
| 原始HTTP body | 4926139字节；SHA256=e420420f3de0ebdfe64138c33004e77fa3eb3aea1135a0afe1d330e192bc2eb5 |
| SSE解析 | 13553个有效JSON帧，13552帧含思考字段；无非法JSON事件，无残缺末事件 |
| 流终态 | 13553个choice的finish_reason均null；无[DONE]、无错误帧 |
| 助手正文 | 0字节；JSON在位置0报Expecting value；未进入原Zod／冻结数值验证 |

上述帧数不是token数。流中的usage随分片出现，末条completion_tokens为1，不能把该末条当成完整任务用量；未取得正常终止用量或账单金额。零付费边界继续以用户已确认的Workers Free超额拒绝为依据，不新增付费访问。

## Cloudflare完整存档核对

通过curl GET读取该日志详情与/response，均HTTP200，不触发推理。详情success=true、status_code=200、duration=300266ms，不含内部错误字段。/response返回原生JSON聚合格式，5827331字节，与response_size一致，下载SHA256=4f4693d8d936c42f93751db3a22af8d186d3e1f81031cedd2b4b791abebdc0e6。

streamed_data共13553帧，其choice索引、正文、思考字符数、结束原因及错误字段的逐帧投影SHA256与客户端均为2d446f92209a6a3ea7340c137a2c3dc54499df2e8f07f1fd9842cb7fc23b1ebc；双方组装正文相同，均为空。原生聚合格式不能据此证明网关曾记录[DONE]，客户端原始流确认没有该结束标记。HTTP原始SSE与网关JSON聚合格式不同，不比较两者原始字节是否相等。

思考原文只在内存中处理，私有副本仅保留脱敏标记和字符数；完整网关下载字节数与SHA256在脱敏前计算。未伪造结束帧、补正文、修复JSON或将诊断结果写成正式报告。

## 验证与保全

- 本机受控流、原始正文发送、fixture正文、stop／DONE识别与思考脱敏均通过；源码摘要锁定，Python仅加载标准库，真实发送端为/usr/bin/curl。
- 新增授权1/1已用，plan.remainingAuthorized=0、submitted-once.lock存在，HTTP重试0；失败后只读日志，未补发或切换GLM。
- 三仓原文件摘要及旧验收包的最终比较见私有final-proof.json；主仓仅更新本回执及两份现有Task，原145个验收包文件保持。三个仓库HEAD／Git索引保持，暂存区为空。
- 真实模型请求没有经过业务Server／Worker，不部署、不写配置或业务数据、不启用Provider或V2；当前Docker没有应用容器，目标数据库及V2运行态无法重新反读，不能将历史关闭状态冒充当前实测。
- G3正式报告／引用／历史／浏览器消费未验，T5与D41双模型条件保持未完成，2020-12候选未推广，旧GLM1次继续冻结。

## 可反读证据

私有目录.recovery-artifacts/g3-d45-direct-http-20261029/保留：direct.py、plan.json、request-body.json、offline-proof.json、preflight.json、client-proof.json、submitted-once.lock、dispatched.json、response-headers.json、response-redacted.ndjson、assistant-content.txt、outcome.json、upstream-identifiers.json、gateway-log-detail.json、gateway-response-redacted.json、gateway-assistant-content.txt、gateway-comparison.json、workspace-before.json、final-proof.json。所有模型调用仅由direct.py live-once的一次curl POST产生；read_gateway.py只执行终态后的日志GET。

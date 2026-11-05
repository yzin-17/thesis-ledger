# 第4至15项本地实施证据

对应[父任务](../archive/tasks/2026-11-04-todo-4-15-delivery.md)。本文件保存已运行检查与实际限制，不是完成状态或后续计划的所有者。

## AI合同与参数

写入范围为AI用途推理强度／指纹／冻结、文本字段指令准备和只读守卫、空JSON失败的类型、完成元数据和计量传递。没有调用真实模型，没有改用户默认Provider、费率、输出策略、凭据或旧实验账本。

- 在apps/server执行vitest的test/ai、test/strategy-authoring、test/strategy-optimization：132个文件通过、32个跳过；906项通过、144项跳过。日志ai-related-package-tests-second.log。其后的用途保存失效反例和探针提示整理由67项定向检查通过，见ai-purpose-final-directed.log。
- 在packages/schemas执行vitest：123个文件通过、1个跳过；1451项通过、3项跳过。日志ai-schema-package-tests.log。十进制反例逐值比较旧接受集合、应用侧与输出JSON Schema，不用Number转换。
- 受控SDK的空文本／空白、正常JSON、截断、已报告用量、OpenRouter格式的已报告0.0012 USD均由本地HTTP/SSE生成；该金额是夹具，不能作为真实正金额供应商费用验收。
- 文本指令缺失／过期在SDK边界零请求；优化在initialize预算之前拒绝、零结算、零派发。相关55项通过见ai-guard-final-directed.log。
- Server和Desktop阶段性tsc --noEmit及schemas build通过；后续源码变化仍需对应包门禁。跳过的集成任务未作为实际PostgreSQL／目标运行态证据。

## 显式行情计算锚点

共享合同按市场本地日期规划，原始ISO时刻精确裁剪。DSA既有chart V3测试明确港股日线带+08:00、美股带-04:00；不能用UTC截日期替代市场日。

- shared锚点边界2项、Server局部20项、API Client相关18项通过；后新增的Nest本机HTTP参数绑定和400零来源读取反例所在12项也通过，见chart-anchor-schema.log、chart-anchor-server-directed.log、chart-anchor-client-directed.log、chart-anchor-http-second.log。
- Desktop推理强度编辑往返及图表历史扩窗／分段重试／独立最新检查26项通过，见chart-anchor-desktop-third.log。该检查使用受控React／Query夹具，不替代浏览器。
- 最初根目录vitest扫描到历史mobile release源码快照而失败，后来使用正确包目录；旧失败日志保留，没有修改历史快照或测试ignore。

## 运行态和保护

本机3000的/api/v1/health返回200，相关Server、Worker和DSA容器健康；这是只读观察，本轮未执行正式同步，实际源码对应关系尚未核对，不能证明本轮功能已部署。当前LM Studio保存地址为192.168.5.20:6789，模型为qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m，仅已读取配置，未发生成请求。

三仓HEAD仍与父任务基线一致，暂存差异均为空。没有执行Docker状态变更、清库、通知、提交或推送。上述日志位于主仓.recovery-artifacts/todo-4-15-delivery-20261104/；后续检查按实际输入继续登记，已通过且输入未变的高成本检查复用。

## 分钟与跨进程验证

Domain分钟聚合10项、Server分钟窗口及既有原生消费17项、港美日历／时钟38项、Desktop周期／时间／历史刷新25项、DSA指标31项通过。独立uvicorn进程四种分钟周期及能力端点共5个成功HTTP响应，篡改绑定返回422；主仓TypeScript实际解析全部5份响应通过。Server及Desktop类型检查通过。命令／失败日志保留在本轮recovery目录，真实来源调用为0；这不是目标实源或浏览器验收。

## 组合估值真实存储基线

只读核对目标thesis_ledger／thesis_ledger，transaction_read_only=on；共有28账户、5持仓、138 LedgerEvent、20 Trade、18 closeSlice、22 allocation。当前目标编译产物sha256为 `9db3a38a762129cf5fd596d776de233d63eb8ca7b051882500d65c2d5f428b2d`。通过当前PortfolioService及TradeQueryService，在RepeatableRead只读事务中分别以actual／shadow各执行3次；报价／净值为受控引用，外部请求0，未将其当作真实来源计价。actual有2只基金，shadow有3只股票；均无需FX，因此真实FX时延未测。actual冷启动105.312ms、后两次7.679／7.808ms；shadow10.399／6.589／5.207ms，含连接和事务边界。

actual／shadow分别执行8／9条实际SELECT（含名称读取）：LedgerEvent各1条、Trade各1条、closeSlice各1条，shadow另有allocation1条。一个Prisma嵌套查询不能说成一条数据库SQL；当前查询未按持仓数重复。此次规模未发现现金投影或realized读取瓶颈，暂不改SQL、索引或金额算法；FX集合读取的受控回归仍需完成。小数据结果不外推到大规模历史账本。详细读数见portfolio-readonly-profile.json与profile.log，未输出账户标识或金额。

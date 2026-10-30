# G3前端补验与任务收口

## 范围与基线

用户要求接续已有报告的前端验收和Task状态收口。本轮不调用模型、不续新闻准入、不修改配置／业务数据／应用源码，不stage或commit。目标为D59报告e55cf8da-a0db-4617-80ff-350111e804e6；V2保持开启、默认OpenRouter/free修订7，服务镜像1654b11a1f4b…、Schema head及全部运行态保持。

D60私有包为.recovery-artifacts/g3-d60-frontend-closeout-20261029T154400Z/。对当前三个脏仓库先记录HEAD／索引、全部源码／文档摘要和39张表／实际环境；没有使用Git HEAD覆盖工作树。数据服务DG2a/b/c／DG3、研究G2a/b、T8及R01从原权威Task与证据复用，不重做已过高成本验收。

## 实际浏览器验收

使用本机已安装Microsoft Edge的隔离无头会话和已有Playwright1.62.1，真实当前前端源码经只监听loopback的Vite连接目标Server；未使用fixture拦截替换报告或材料响应。网络门禁仅允许本地GET／HEAD／OPTIONS，拒绝写方法与外部主机。共记录47个只读API响应，写请求、阻断请求及应用pageerror均0。

真实阅读页的题目／结论与数据库保存值一致，5条结构化数字、实际Nvidia模型、模拟范围及资料partial正确显示；11个材料按钮逐个展开，11个真实冻结材料接口均200，示例报价1354 CNY与原保存值相等。新闻准入已于2026-10-29 23:31:34到期，旧报告和材料仍可读取，本轮未获取新新闻或延长准入。

页面刷新后正文与11来源保持；返回模拟模式历史，首条保存报告从“查看”打开同一run的抽屉，再经“展开完整阅读”进入同一阅读页。切至实际范围时列表为空，原模拟报告返回明确的范围拒绝且不展示正文；切回模拟可再次读取原报告。最后将隔离会话恢复实际模式，关闭浏览器和本轮Vite服务。示例截图为report-reading.png、sources-expanded.png、history-list.png、actual-scope-isolation.png及mode-restored.png。

验收程序初次依赖加载及stdin会话调整未触发业务调用；在抽屉模态中无法操作背景模式按钮属于正常交互隔离，后经完整阅读页和列表完成真实模式切换，没有强制点击或降低校验。本轮只计Web，不计安装态Electron或原生设备新验收。

## 数据与运行保护

browser-assertions.json确认47个只读响应、11来源、刷新／历史／抽屉与阅读、实际／模拟隔离全部通过。runtime-protection.json确认39张记录表的行数和摘要一致，新增AiRun=0、AiToolCall=0；全部容器ID／镜像／挂载／开关、.env摘要、默认及原Qwen报告保持。没有部署或模型请求，GLM冻结保持；完整WIP／文档链接核对以workspace-protection.json为准。

## 最终一致性Review

研究G3按RA2～RA6、RA10及RA11消费侧收口：D58／D59提供真实数据／模型、原数字／范围／引用及报告／历史／trace和重建证据；D60补齐当前报告Web。依赖已由DSA、研究G2a/b及R01各自验收，不把其历史表述误读为当前阻塞。G3失败实验及旧预算完整保留在[历史记录](2026-10-30-g3-diagnostic-history.md)。

超时治理按AE1～AE17收口：T7／T8／T10a／T11覆盖时钟、期限及持久化，T9／T10b-c覆盖SDK／探针／用途，T12／T13覆盖有限重试、预算及影子缓存，T14覆盖页面观察和显式取消，T15／T16覆盖本地、隔离PostgreSQL／Redis及正式部署，T5由D58／D59／D60补齐真实正向。未观测TCP/TLS不伪造，影子阈值未自动应用；[已完成任务](../../archive/tasks/2026-10-25-ai-adaptive-execution.md)归档、[现行Spec](../../specs/2026-10-25-ai-adaptive-execution.md)保留。

当前G3和本治理阶段没有剩余实施或验收阻塞。研究Task仍承载P2的T13c／G4b和条件性P3；D41双模型方言候选、GLM冻结、SDK G1其他业务／协议／费用及其他客户端分别保持其独立条件。报告资料仍partial，不将结构化校验当成全部金融文本事实已核验。未新增或恢复任何调用预算。

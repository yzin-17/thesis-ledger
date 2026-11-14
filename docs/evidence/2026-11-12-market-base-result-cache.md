# 基础行情60秒缓存实施与门禁记录

最新状态见[完成阶段证据](2026-11-12-market-base-result-cache-completion.md)：完整DSA门禁、生产者正式快更、实际隔离Redis、C5扩展及四宽受控浏览器已通过；Server完整扩展更新被并行业务迁移挡住。下文为此前各检查时点的原始记录，历史23／34失败和未部署状态不改写为当前事实。

对应[当前任务](../archive/tasks/2026-11-11-market-base-result-cache.md)与[规格](../specs/2026-11-11-market-base-result-cache.md)。本页记录2026-11-12的实现和验证；此前准备阶段保留在[源码盘点](2026-11-11-market-base-result-cache.md)，真实输入见[美股及两阶段汇总](2026-11-11-us-intraday-observation.md)。

## 已确认范围与实际结果

用户在四批美股采样结束后选择普通查询最多复用60秒，手动刷新跳过缓存，历史长缓存暂不启用。首个闭环为富途美股股票1分钟不复权交互读取，要求共享日历明确开市且窗口包含当日；其余口径保留原路径。该策略不是供应商更新频率或来源实时性证明。

最小闭环源码及受控验证完成，DSA新增控制投影尚未部署。当前运行态保留旧DSA，并已恢复Server的混合版本兼容；新增Redis缓存没有通过实际运行态验收。完整缓存仍被DSA全仓23项失败阻塞，不将消费者快更当作新增缓存部署。

## 实现与所有权

| 所有者 | 写集与行为 |
| --- | --- |
| 公共契约 | `packages/schemas/src/market-bar-cache-context-v3.ts`定义交互用途、标的、精确bar路由、具体来源与顺序、窗口及控制代次；经现有cache-context入口联合解析，旧五类请求保持兼容。 |
| DSA | 新增`thesis_ledger_bar_cache_contract.py`及`thesis_ledger_bar_cache_context_v3.py`，原API按能力分发。以原Store和目录前后两次采样，绑定配置/凭证、权限/依赖、适配修订、窗口准入及政策代次，零价格/SDK调用；新增测试登记到数据清单。 |
| Server Market | `market-chart-result-cache.ts`在具体来源已选定、调用DSA基础行情前复用成功载荷；`market-bar-result-cache-store.ts`保存有校验摘要和绝对期限的载荷，排除旧请求ID，命中后重建本次关联。 |
| 请求协调 | 原`MarketService`的请求合并及Redis资源锁提取至`market-request-coordinator.ts`；原消费者复用同一实现，大文件净减少职责。刷新与普通读取分组，写入票据阻止同进程及跨实例晚到覆盖。 |
| 门禁 | `scripts/check-boundaries.mjs`通过已有`market-window-consumer-boundaries.mjs`新增交互缓存不得进入研究/冻结路径的规则与测试；DSA能力门禁禁止缓存控制直接取价格或构造SDK。未提高阈值或添加忽略。 |

60秒期限从原始`sourcePriceBasis.observedAt`计算；命中、Redis转存和派生计算不续期。空结果、错误和无效载荷不写为成功缓存，也不引入旧成功值回退。Redis命令有500毫秒局部上限，故障降级至原受控读取；新增缓存、控制及来源阶段合计受原DSA请求预算约束，超时晚到不发布结果。一个等待者取消不取消其他合并调用。

## 工具函数选型

按`recommend`核对Server实际依赖es-toolkit 1.51.0的导出、声明与源码，并查阅官方文档。使用入口均为`es-toolkit`，未变更依赖或lockfile。

| 候选 | 输入与返回 | 行为与开销 | 本次选择条件 |
| --- | --- | --- | --- |
| [delay](https://es-toolkit.dev/reference/promise/delay.html) | 毫秒及可选signal，返回Promise | 可取消等待，一次计时器 | 复用既有有界资源锁等待，不是来源节流。 |
| [withTimeout](https://es-toolkit.dev/reference/promise/withTimeout.html) | 异步函数及期限，返回Promise | 与超时Promise竞速 | 用于Redis命令及缓存阶段总时限；用独立signal在结算后撤销计时器，不把调用者取消传为“取消期限”。 |
| [omit](https://es-toolkit.dev/reference/object/omit.html) | 对象与键列表，返回新对象 | 不修改输入，复制保留属性 | 缓存载荷去掉`requestId`，示例为`omit(response, ['requestId'])`。 |
| [memoize](https://es-toolkit.dev/reference/function/memoize.html) | 单参数函数及可选cache，返回记忆函数 | 默认Map保留返回值，包括Promise | 没有本任务的完成/失败自动释放、刷新分组和分布式写入围栏；保留已有有界Map合并语义。 |
| [Mutex](https://es-toolkit.dev/reference/promise/Mutex.html) | acquire/release，返回等待Promise | 进程内串行化 | 不负责返回同一结果或跨Server协调，不替代既有请求合并及Redis锁。 |

运行态受控检查曾暴露es-toolkit 1.51的`withTimeout`在成功后仍保留竞速计时器。已在Market请求协调模块集中清理败者计时器，加入`vi.getTimerCount()===0`断言；最终目标容器检查79毫秒完成逻辑、命令正常退出，不用强制退出掩盖未清理资源。

## 本地与契约验证

以下均在当前工作区执行，Node使用24.22.2。原宿主仅有Node26；已通过临时项目的Volta镜像hook取得Node24，临时配置已删除，没有修改默认Node或项目manifest。

| 检查 | 结果与有效范围 |
| --- | --- |
| schemas定向新旧cache-context测试 | 24项通过；身份、窗口、来源、周期、用途和状态错配拒绝。 |
| `pnpm --filter @thesis-ledger/schemas test` | 139文件、1547项通过；同一契约源码随后build成功。 |
| DSA新旧cache-context定向测试 | 49项通过，其中新增bar控制20项；包括真实Store、原API、零SDK、资格/凭证失效、不稳定快照及非法控制事实。 |
| 跨仓实际JSON桥接 | 独立临时SQLite中执行真实DSA投影，输出经主仓已构建Schema及关联函数验证；两进程退出0，价格/SDK调用为0。不是目标生产者部署证明。 |
| 缓存定向Vitest | 最终23项通过；重复/20并发、原始到期、条数与代次、刷新竞态、跨实例围栏、错误/空值、损坏载荷、Redis故障/超时、取消、总预算、未知日历及旧DSA兼容。跨实例使用受控Redis接缝，不冒充实际Redis。 |
| Market离线单元范围 | 显式选取101个非`.integration.`测试文件，100文件通过、1文件按既有条件跳过；1075项通过、9项按既有条件跳过。真实Redis/PostgreSQL集成不在此结论内。 |
| Server类型、构建与定向ESLint | 最终源码通过；部署入口再次完成workspace/Server产物准备。 |
| 静态边界及尺寸检查 | 导入边界退出0；新增边界3项测试通过。尺寸检查退出0，有6项其他存量警告且未提供有效基线，不将其表述为全仓历史债务已验收；本轮新模块未超过阈值。 |

Market离线命令为从`apps/server/test/market/*.test.ts`选取不含`.integration.`的文件，交给`pnpm --filter @thesis-ledger/server exec vitest run`；类型、构建分别使用同包`typecheck`、`build`。对应源文件变化后仅重验受影响范围，未重复运行未变的DSA全量失败集合。

## DSA完整门禁失败

执行目录为DSA，使用其`.venv/bin`加入PATH运行`./scripts/ci_gate.sh`；为测试框架设置`PYTEST_ADDOPTS=--junitxml=<主仓私有回执路径>`。脚本依序进入完整离线测试，前置语法、关键flake8及确定性阶段未阻断。

Context Mode调用在300秒触及工具RPC上限，但原门禁进程继续运行。核对同一进程结束后读取最终JUnit，没有重启或复跑完整门禁。JUnit记录8277条测试条目（含框架展开项），23失败、0错误、1跳过，耗时311.247秒；这是JUnit统计，不能直接冒充pytest主测试通过计数。

私有证据为`.recovery-artifacts/provider-intraday-20261111/cache-implementation/dsa-ci.xml`，文件权限600、父目录700、Git忽略。失败断言分布：

该JUnit文件SHA256为`bbea939053482fcf70217f07e087a35bee316348b962c24b064a2c3657ba3b9c`，未因工具超时丢弃失败证据。

| 断言范围 | 条数 | 代表节点 |
| --- | ---: | --- |
| 腾讯完整请求参数预期 | 2 | `test_adjusted_daily_capability_audit.py::test_tencent_stock_hfq_through_factory`两参数样本 |
| 研究资格及支持范围 | 5 | CN调整研究、HiThink、上市信息、腾讯后复权及旧契约支持判断 |
| 受控bars HTTP状态 | 1 | `test_data_runtime_acceptance.py`的200/422预期冲突 |
| Dockerfile安装缓存 | 1 | `test_docker_entrypoint.py`旧文本断言 |
| 新闻准入与调用约束 | 5 | AKShare、HiThink、Yahoo、新闻列表及来源准入 |
| 目录元数据或绑定数量 | 9 | admission、Control目录、富途分钟数量、HiThink目录、上市/收费/风险限制/交易状态目录 |

没有删除、放宽断言或将失败文件移出数据测试范围。以上按实际失败位置整理，未对23项逐一做完整回退归因，不能笼统认证全部与本次无关；新旧缓存控制49项均通过，也不能用它们替代全仓门禁。后续需按稳定源码核对这些冲突，门禁通过后才能更新新DSA生产者及验收真实Redis缓存。

## 混合版本故障与独立消费者恢复

01:00只读检查发现Server于00:46:55被并行更新，容器已包含新缓存模块；DSA容器仍没有bar控制模块。通过实际Server中的`DsaClient`发送零价格调用的控制请求，得到`invalid-request`。这与健康检查同时成立：健康不证明新控制契约可用。

因此增加旧生产者兼容：明确不支持新契约时不访问新增Redis缓存，退回原精确行情端点的控制链；关闭、权限、修订变化及无效响应仍拒绝。作为已存在混合版本故障的消费者修复，C3.R只依赖自身Server低层门禁，保留旧DSA，不接纳新生产者，不计为完整缓存部署。

正式恢复执行目录为`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`，入口为`./scripts/sync-code.sh thesis-ledger`；宿主PATH显式使用Node24.22.2。首次兼容修复退出0；受控检查发现计时器保留后修正源码、重验受影响低层检查，再通过同一入口快更，最终退出0。未调用`update.sh`、绕过正式入口或更新DSA。

最终Server与Worker启动时间分别为01:12:13、01:12:10北京时间，均健康，镜像仍为`sha256:4a541fd6135c0ffd81aea7088e940bcbbb4b7edebb1a5c7f82266ddb7fe534ce`。DSA启动时间仍为前一日18:39:40，镜像仍为`sha256:f34796cac189c0b9866f8278273b2b690f57f71b2144f782eb99eae48e9740f4`。正式脚本报告没有数据库结构或外部卷变更；只更新可写层，未重建镜像。

独立目标检查加载最终容器编译的`MarketChartResultCache`、实际`DsaClient`及`MarketSessionReader`，对旧DSA控制契约使用真实HTTP，行情loader使用受控哨兵，Redis方法设置为不可调用。断言通过：`controlledLoaderCalls=1`、`redisCalls=0`、`providerPriceCalls=0`、`cached=false`，逻辑耗时79毫秒，命令退出0。此证据不代表真实价格请求、实际Redis缓存或浏览器新功能验收。

## 当前停止边界

C0～C3局部交付及C3.R消费者兼容恢复完成。DSA D2、真实Redis C4、其余口径C5、完整缓存部署C6.1及四宽浏览器C6.2仍未通过，继续保留活动任务。下一步先核对DSA23项失败的当前所属修改与断言合同；不在移动基线上重复全量测试，不额外调用腾讯、富途或Yahoo，不恢复已删除自动化。

本轮保留全部WIP，没有提交、推送、清库、删除卷或写真实策略。旧DSA兼容恢复不会使新增60秒缓存进入已认证可用状态。

最终文档的相对链接/锚点检查通过，新增说明文档标题为中文；主仓与DSA目标文档的定向`git diff --check`均通过。当前Task已勾选项与局部证据一致，C4/C5/C6及DSA D2/D3保留未完成状态，不以阶段交付结束总目标。

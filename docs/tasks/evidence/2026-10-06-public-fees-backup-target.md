# 公共收费备用切换目标验收

> 日期：2026-10-06（Asia/Shanghai）。对应 [Spec](../../specs/2026-10-06-historical-rules-primary-backup.md) AC2、AC3、AC5 与 [Task](../../archive/tasks/2026-10-06-historical-rules-primary-backup.md) P4.1～P4.3。
> 结论：P4 的有界备用包、整窗切换、两源失败模型兜底及冻结重放通过。P5、P6 保留未完成；没有宣称全历史、三市场、严格 PIT 或基准净收益完整支持。

## 实现与来源

现有 `official-rules` Provider 增加精确来源 `cn-stock-auction-fees-archive`，独立读取 DSA 生产文件 `data_provider/public_fees/cn-stock-auction-archive-2023-08.json`。覆盖 2023-08-22～29，主包仍为 2023-08-23～29。两包分别声明覆盖、来源文档及内容版本，实际请求整个区间选择一包，不拼接。

备用费率根据实际读取的公开资料整理：

- 印花税变化：[上海税务局第39号公告](https://shanghai.chinatax.gov.cn/zcfw/zcfgk/yhs/202308/t468451.html)。发文日 08-27，页面发布时间 08-28；备用来源元数据保留页面日期，不将其倒填为历史首次可见时间。
- 经手费变化：[国务院网站新华社转载](https://english.www.gov.cn/news/202308/18/content_WS64df6b79c6d0868f4e8deaa6.html)。08-18 页面说明沪深费率由 0.00487% 改为 0.00341%，08-28 生效，性质为政府新闻转载。
- 过户费：[武汉金融局转载](https://jrj.wuhan.gov.cn/ynzx_57/xwzx/202204/t20220429_1964160.shtml)。04-29 页面说明成交额 0.01‰ 双向计收，保留转载性质。
- 印花税法及监管费与主包共享同一政策依据；监管费文件再次实际读取 [发改价格规〔2018〕917号](https://www.ndrc.gov.cn/xxgk/zcfb/ghxwj/201806/t20180627_960950_ext.html)，股票交易额 0.02‰。

这是独立本地文件读取路径，针对主包丢失、错误或覆盖不足提供备用；两包仍可能共享政策和适配器缺陷，不属于独立政策事实或官网在线容灾。只存必要费率事实及引用，没有复制新闻全文。运行时按需读取本地包，不逐日下载公告。

Server 修复主源数据无法组合时提前使用模型的问题：继续尝试已配置备用。主源成功时不双读；主源不 eligible 时跳过；两源均失败才使用原先已明确选择的模型。实际备用响应与可选 `fallbackReason` 一同冻结，旧 Snapshot 不要求该字段；Runner 不选源或联网。

## 本地验证

| 检查 | 结果与边界 |
| --- | --- |
| DSA 收费三个定向测试文件 | 27 项通过；生产包、缺主包、精确 target、真实 HTTP、两包覆盖不足、无隐式切换 |
| DSA `PATH=.venv/bin:$PATH bash scripts/ci_gate.sh all` | 退出 0；7,873 项、626 子测试通过，1 skipped、4 deselected；局部 flake8 通过 |
| Server 收费/传输定向 | 初次 13 项通过；最终 Snapshot 定向 6 项通过，包含合法 wire 缺口、主源不 eligible、无备用、主源成功不双读、整窗备用、两源失败及离线执行 |
| Server 包级 | 300 文件、2,433 项通过；47 文件、217 项跳过；测试输入的最后调整另由上述定向验证，不把跳过项计为通过 |
| Desktop 包级和定向 | 全包退出 0；配置/披露定向 5 项通过；来源版本、费率变化、备用原因与原模型原因可渲染 |
| Schema 包级 | 61 文件、692 项通过 |
| 静态与构建 | Schema、Server、Desktop typecheck/build 通过；源码/测试 ESLint、Prettier、边界/依赖图、复杂度门禁退出 0 |
| 脚本 | target/replay `node --check`、Prettier 通过；项目既有 ESLint 不检查脚本，不把 ignore 警告称为脚本 lint 通过；target backup 默认 dry-run 通过 |

复杂度门禁含存量第三方解析告警，但退出 0；没有调整门禁阈值或新增 ignore。DSA runtime 只改目录就绪调用的一行参数，保持 2,401 行。无依赖、Prisma、migration、Dockerfile、原生配置变化。

## 正式目标同步

在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh all`，退出 0；目标为 DSA、Server、Worker，脚本兼容性预检通过，重启后三者 healthy。

DSA 镜像保持 `sha256:08bfe1b5a0d59d6b27c54e961a5850f603885b4686d459818897c68d3bcd250e`；Server/Worker 保持 `sha256:95d8e518ffee019a8a29a13979b4fd9736f914153c4b78c636d6e0866c87a0b0`。这是容器可写层代码同步，容器重建后会消失，不作为镜像发布证据。没有更改数据库结构或卷。

目标文件与宿主构建输入逐项比较 SHA-256，全匹配：

| 输入 | SHA-256 |
| --- | --- |
| DSA 收费模块 | `86885109769afffca220d0c4d4fc7c438f8f24629cb93ce94cf34e11ee3f99e0` |
| 备用生产包原文件 | `5562cf02db36943b5a1ad439c70c5753522e82595fd51cae4aad8525f27f3113` |
| Server/Worker 收费收集模块 | `51966b9a568b60401ff5ea2a192693fe1827e6c17beac231210becb48ed864d9` |
| Server/Worker 收费披露 Schema | `89865a1da1ad59206db8946fd1413a4c34322a2982313cfe467bc871701db471` |

备用包内容规范化版本为 `official-public-fees-1ea7dc6d7a1400af4875c9b139aceb6dfad02404e295c09f9fcbc40f7ee69709`；内容摘要与原文件字节摘要不是同一口径。

## 两个真实场景

运行维护脚本 `scripts/historical-public-fees-target.mjs --run --scenario=backup` 和 `--scenario=model`，设置 `FEE_TARGET_STRATEGY_VERSION_ID=debb3916-6eee-4b39-8175-54655991e8bd`，复用策略 `c2ca9a3d-fda5-48ce-9715-d69ae8a61d73` 的现有 v2。未新增策略或版本。

只将收费 route 的既有主源后追加备用。实际策略 revision、dsaRevision 同为 39，syncState 为 applied；原 7 条 route、其他价格和 ETF Quote 的目标保持原配置。无登录/session 请求，实际 identity context 仍为 local。

| 场景 | 区间与持久化终态 | 冻结结果 |
| --- | --- | --- |
| 主包覆盖不足，备用整窗接管 | 2023-08-22～29；任务 `1cd688cb-0ad5-42ee-975d-a232ebdde872`，succeeded / attempt 1，5 笔成交 | source，archive 的 routeIndex 1；请求范围不变，保留整段备用原因 |
| 两包覆盖不足，使用已选模型 | 2023-08-21～29；任务 `493112b4-dff5-4f36-8815-e962e31f3134`，succeeded / attempt 1，6 笔成交 | executionModel，原因“公共收费源暂不可用，使用已选执行模型。”；模型原卖侧印花税 0.0005 保持有效，不伪装历史真实费率 |

第一场景快照 `5e946426f654827b4d8c04024dc7aadcb897c84e312b811dc27e5f363d7bacd7`，结果校验和 `539c2c23b71ee89b`。第二场景快照 `cd77a45193d6fc416626a8ac51354a6a4ea68efb19f8f6144b72896e11944947`，校验和 `1c92816c4181a50c`。

没有破坏规则文件、停用路由或停止目标服务进行故障注入；使用真实生产覆盖不足作为主源失败分支，目标运行仍使用真实腾讯 qfq 价格。主包损坏/缺失、wire 合法但计算区间不足和主源不 eligible 另由定向测试覆盖。

## 独立费用计算与离线重放

宿主 Python `decimal.Decimal` 使用 100 位计算精度，对真实结果全部 11 笔成交独立核对：佣金 `max(成交额 × 0.0003, 5)`，过户费 `成交额 × 0.00001`；印花税仅卖侧，备用使用成交日历史分段，模型兜底使用显式模型固定值。每项独立 CNY 两位小数 `ROUND_HALF_UP` 后求和，逐笔与实际 `charges` 相等。

| 备用成交日 | 买卖侧 | 总费用 CNY |
| --- | --- | --- |
| 08-23 | 买 | 5.10 |
| 08-24 | 卖 | 15.13，印花税率 0.001、印花税 10.03 |
| 08-25 | 买 | 5.10 |
| 08-28 | 卖 | 10.38，印花税率 0.0005、印花税 5.27 |
| 08-29 | 买 | 5.10 |

模型兜底六笔费用依次为 5.10、10.13、5.10、10.07、5.10、10.02。佣金已包含监管费及经手费，没有重复扣收。

将维护的 `scripts/historical-public-fees-replay.mjs` 源码通过 stdin 交给目标 Server 的 Node，只读执行，工作目录 `/app`，参数为任务 ID、上述校验和、预期 source 或 executionModel。没有复制文件、保存结果或修改目标状态。每个 Snapshot 连续执行 Runner 两次，均与原结果校验和一致，`networkCalls=0`；备用响应/原因及模型原因保持冻结。

## Web 消费

通过 Codex In-app Browser 实际访问两任务 `/strategy/jobs/<id>`，点击“数据与假设”，没有拦截或替换响应：

- 备用页显示冻结收费、整段区间备用原因、0.1%/0.05% 卖侧印花税、政府转载性质及备用内容版本。
- 模型页显示“公共收费：使用已选执行模型”和冻结原因。
- 浏览器 error 日志为空；免登录本地工作区保持可用。

首次 Web 读取时，运行中的 Vite 缓存没有纳入新 Schema 可选字段，收费组件的 strict parse 因而不显示。停止既有开发进程，以同一回环地址运行 `pnpm --filter @thesis-ledger/desktop dev --host 127.0.0.1 --strictPort --force` 重建依赖缓存后重载页面，两场景均实际显示。没有放宽 Schema 或校验，也未改业务实现来掩盖缓存。此为 Web 验收，不是 Electron/移动 Native 编译验收。

## 保留限制与一致性审查

两结果实际 `completeness=partial`，保留 `BENCHMARK_COST_MODEL_UNSUPPORTED`；本次仅通过策略费用及备用/模型兜底链路，没有补齐最低佣金、买卖分向税费的基准净收益计算。归一化价格/单位、本地研究模型及 `historicalAvailability=notVerified` 保持披露。

已核对契约、精确来源、生产包、目录就绪、顺序切换、冻结身份、原模型兜底、旧字段兼容、真实任务、独立金额核验、离线重放和页面消费。P4.1/P4.2/P4.3 均满足各自声明范围；P5 特殊状态、P6 其他市场未执行，整体 Task 保持 active。全部并行 dirty 修改保留；未 stage、commit、push 或发布镜像。

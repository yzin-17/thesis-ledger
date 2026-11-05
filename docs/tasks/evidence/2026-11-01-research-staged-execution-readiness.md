# 研究阶段化执行的接续预检

日期：2026-11-01（北京时间）。对应[当前Task](../2026-10-18-research-evidence-evolution.md#p3阶段化执行的条件任务)的T15b与[现行Spec §6.3](../../specs/2026-10-18-research-evidence-evolution.md#63-轨迹评估与阶段化研究)，验收责任为RA12。本记录保存本次接续的只读源码与输入核查，当前状态由原Task维护。

## 核查范围与结果

用户要求完成研究阶段化执行。先核对T15a的已交付边界，再定位T15b的真实接入、评价和预算前置；未调用模型、请求外部来源、操作Docker或改动正常配置。既有生产阶段仍以真实实验激活结论为依赖。

| 核查对象 | 本轮直接核对的事实 | 对真实对照的含义 |
| --- | --- | --- |
| 固定集 | `apps/server/test/fixtures/research-experiment-controlled-v1.json`只有2个案例，`mode=controlled-offline`、`datasetKind=synthetic`，字节摘要与T15a记录一致 | 不能充当至少20个合格案例；不复制、拼接案例凑数 |
| 协议 | `research-experiment-protocol.ts`将Provider/模型/修订固定为受控值，`sealedEvaluation.qualityGrade`只接受`null` | 当前合同不能表达真实模型及可用质量评分；需独立真实协议 |
| 驱动 | `assertControlledBinding`只接受显式`http://127.0.0.1:<port>/v1`；生成结果和财务参考分列，质量/收益成绩为空 | 不直接替换URL或移除回环保护，不将受控结果计为质量提升 |
| 维护入口 | `scripts/evaluate-research-experiment.mjs`建立本机响应端，禁止其他响应地址；调用现有SDK并核对接收请求与审计条数 | 只实现受控SDK链路，尚无真实实验入口 |
| 实验范围 | 每案例单链1次、三阶段3次；20例完整执行最多80次生成请求 | 80是成功完整对照的预览上限，不是本次授权；失败停止、重试及总预算须在真实协议中固定 |
| 生产接续 | T16a/T16b/G5均依赖T15b明确激活 | 不能提前实现或启用生产阶段来绕过实验门禁 |

对`docs/benchmarks`、`apps/server/test/fixtures`、`scripts`及`docs/tasks/evidence`做了限定主题检索；未发现另一份已登记的真实实验固定集或封存评分文件。本轮已请求用户提供对应材料的本地路径，不能据此断言其他未指定目录不存在材料。

## 输入基线

工作区有既有未提交修改。本轮实际修改原Task与本证据文件，不改变Spec合同、业务源码、案例、依赖或运行态。

| 输入 | SHA-256 |
| --- | --- |
| `docs/specs/2026-10-18-research-evidence-evolution.md` | `38f524b6e05cce5f8bebbc586ae232da6ca1fd85090ea7926103c93a46cb70be` |
| 写前Task | `29adb43073f92e3200abf8157635cb6982e932479741c7cac834284e19713cc9` |
| `research-experiment-protocol.ts` | `9a88c27ae72f5b765ebff6235bdb0c77cba1c8b38d00fedd2f815c59d4efa014` |
| `research-experiment-driver.ts` | `f027967b60ec41bc2974e0aba49161c3768ff1eb62f81c1636a39cf82b3cd0ec` |
| `research-experiment-audit.ts` | `dae7e8d830f58901c4afd89302105999e7b336fc136541df1bb523d4c4b7c562` |
| `evaluate-research-experiment.mjs` | `1f84a3e497777d928ab873eaf3d2bcd9ce7ed8030ef4a0e521ac3290a169b8d7` |
| 受控固定集 | `c5447a0bfd6af2f55ecfe96ae23090bf0070725ac5c829139364b69c6f5b2fdd` |

三仓写前HEAD/index摘要已在本轮命令输出核对；未暂存、提交或推送。既有T15a结果[受控实验回执](2026-10-19-research-experiment-offline.json)的`activation=not_evaluated`，不能作为真实激活依据。

## 接续边界与缺失输入

原T15b同时包含尚未定义的真实协议、未交付的真实接入和真实质量评价，不能作为一个可直接执行的叶。本轮按原RA12义务拆为T15b.1协议与评价输入、T15b.2隔离SDK接入、T15b.3真实对照与决策；没有增加产品范围或降低阈值。每叶的启动条件、写集和验证由原Task唯一维护。

真实协议定稿前仍需要：

- 至少20个合格案例及来源/冻结范围，独立封存评价、参考答案或评分规则；评价不能进入模型消息，缺失成绩不能填零。
- 指定既有Provider、固定模型与修订，以及本次允许的请求总数、Token/时间预算、费用上限与币种。现有费用上限0继续有效，受控0.02 USD不是付费许可。
- 真实接入沿既有SDK、事实核验与审计合同执行，不读取或输出凭据内容；需要实际模型变化时保持可追溯，不能混用不同实际模型后声称同模型公平对照。

本轮没有真实实验结果，不能决定激活，也不能将T16/G5计作完成。材料及独立调用预算就绪后，从T15b.1恢复，先验证真实协议及受控SDK接入，再运行获准对照。

## 验证与预检结论

本轮验证为源码/JSON只读核查、固定集与代码SHA-256计算、限定目录主题检索及文档一致性检查。写后检查55个本地链接/锚点无错误；T15a保留已过，T15b.1～3、T16a/T16b/G5保持未勾选；6个受保护输入及三仓HEAD/index摘要均保持。两份文档的Prettier检查通过。这些检查只证明本次文档与接续边界一致，没有重新运行受控实验、业务测试、构建或目标服务验收。

格式检查首次使用系统`node`时，Volta因本地缺少项目要求的Node 24而在执行前退出126；随后直接使用现有缓存运行时执行同一Prettier检查，退出0，没有安装Node或修改依赖。通过命令为`/Users/yzin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/prettier/bin/prettier.cjs --check docs/tasks/2026-10-18-research-evidence-evolution.md docs/tasks/evidence/2026-11-01-research-staged-execution-readiness.md`。

规划预检结论：**阻塞**。T15b.1缺少合格固定集、独立评价和明确真实调用预算；T15b.2/T15b.3依赖的真实协议尚未就绪。T15a保持原已验范围，T15b/T16/G5不增加完成勾选，不迁入TODO。

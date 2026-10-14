# P6 新增公共收费与已有实现验收

关联：[Spec](../../specs/2026-10-07-p6-market-state-expansion.md)、[Task](../../archive/tasks/2026-10-07-p6-market-state-expansion.md)、[上市与退市验收](2026-10-07-p6-lifecycle-extension.md)。本轮按用户要求验收已有实现；不扩大港美历史原价、实际股数、整手、价位及严格历史PIT资格。

## 输入与修正

港股固定00147.HK、2025-08-06～11，沿用Yahoo qfq归一化价格及盘中暂停的保守日线解释。新增公共来源为`official-hk-rules/hk-stock-public-fees`：交易费、印花税、SFC、AFRC独立费项及原件摘要；印花税每笔整港元进位，其余逐项两位halfUp是显式研究模型。富途佣金及平台费为独立的已冻结研究预设，不改写公共来源，也不声称完整券商账单或账户历史适用。

核对[港交所CT/158/23原件](https://www.hkex.com.hk/-/media/HKEX-Market/Services/Circulars-and-Notices/Participant-and-Members-Circulars/SEHK/2023/ce_SEHK_CT_158_2023.pdf)发现发布日期是2023-11-15；2023-11-16为法例刊宪日期，2023-11-17为费率生效日期。已修正DSA来源包及对应Schema合同样本的发布日期，原件字节SHA-256和实际首次读取时钟保留。目标任务使用修正后来源，没有回写旧快照。

美股固定GME.US、2024-05-10～24，来源`official-us-rules/us-stock-public-fees`包含Section31与TAF实际股数维度。TAF依据已保存FINRA规划原件及[2024现行收费交叉原件](https://www.govinfo.gov/content/pkg/FR-2024-11-27/pdf/2024-27764.pdf)，记录每股0.000166、每笔上限8.30及低于费率的成交价豁免；规划原件发布日期未证实，保持null。该包明确汇缴/券商转嫁未纳入，历史首次可见性未核实。没有取得GME历史原价/实际股数资格，因此只验收读取、拒绝和受控算法，不创建真实股数TAF回测。

## 本地门禁与正式目标更新

本轮定向：DSA状态/收费/路由16项、编码/收费14项、Schema7项、Server8项、Desktop9项通过。既有新费用与上市合同、执行和客户端源码未改变，沿用最近包级证据：Domain419、Schema773、Desktop767、Server2561通过/217跳过，及已通过的类型/构建；Domain最终门禁已经包含富途最低额优先修正。新来源日期修正另外通过上述定向检查，不把未重跑的全包写成新运行。

DSA正式`PATH=.venv/bin:$PATH bash scripts/ci_gate.sh all`最后退出0：8224项及626子测试通过，1 skipped、4 deselected不计通过，日志`p6-extension-dsa-gate-final.log`。首次本轮全门禁唯一失败为`requirements.txt`中文行内注释不符合ASCII检查；仅移除该注释，保留`pypdf==6.19.0`及所有依赖。新费项测试的未使用导入同步移除，完整所需关键flake8通过。首次门禁及修复后的通过均保留。

运行目录`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`，入口：

```sh
DEV_DATABASE_MODE=check PULL_SERVICE_IMAGES=false PULL_BASE_IMAGES=false ./scripts/update.sh dsa
```

脚本完整退出0，日志`p6-extension-dsa-update.log`。DSA镜像`sha256:4735c6fe4aa85f0fecfc1105eeef4b58508d5e4ed29b2bd011c012da0c2c6570`已部署；Server/Worker镜像仍为`sha256:87ef0df18aeb80f596f1379dc06237593e19b8d588e4e17bbcc7b99d78973499`，此前应用可写层保留，未固化新的Server镜像。五容器健康，没有数据库结构升级或数据恢复。

正式脚本按既定政策自动整备Docker内容，并实际触发Docker Desktop空闲磁盘块回收；构建前宿主20854 MiB≥20480，Docker18435 MiB≥18432，默认门槛未降低。依赖和SDK构建耗时较长，等待脚本主动结束；未绕过入口、终止构建或删除volume。回滚标签仅由正式脚本按保护策略维护。

容器与宿主以下SHA-256逐项一致：

| 输入 | SHA-256 |
| --- | --- |
| DSA requirements.txt | `04c7d4714ecc48426329609d1071ff1f0f839a24e30da38fc53823cab91ecbce` |
| 港股扩展收费包 | `4dcf5f5e8ad9da71c399f2a887d883526a10b379a24ea32068d17fba723a91f1` |
| 美股扩展收费包 | `6ae3d98e3f9cc3407e54288622558e511843c36b59dff8dc19e6b29edb98b9cc` |
| 603350上市包 | `9d708f89fbdbf148c78c839ec50ffcfb19dcf68700efb955cd8855ea35f6e6f2` |
| 600462退市包 | `7b74438141129bd5de06f1585f77ca68e2c925075dd9c2bbe0caed0748c9571f` |

边界门禁、文件尺寸门禁、Node/Python语法、限定格式及diff空白检查通过；尺寸门禁仅保留9项既有警示。诊断验收`.mts`单文件ESLint入口因未配置该脚本的类型信息而无法运行，未计为通过、未修改或放宽配置；该脚本已通过三份真实下载的tsx执行与全文深比较。首次误用不存在的尺寸脚本路径已改为正式`check-file-size-guardrails.mjs`并通过。

## 港股标准任务与独立计算

入口`node scripts/public-fees-expansion-target.mjs`临时选择唯一港股收费路由，复用`multimarket-rules-target.mjs --expanded-fees --broker-costs --run`执行标准策略保存、准备、创建和Worker终态读取。结束时按当前修订仅恢复原收费选择，其他来源与配置保留；US读取也独立恢复其原路由。最终独立GET核对policy25/applied，HK恢复`hkex-trading-fee`、US恢复`us-section31-exchange-t2`。没有把测试来源长期写入用户配置。

任务`d555954d-a545-4845-aaf6-e5be5cf245a3`：succeeded/attempt1，checksum `767245e2c4ddc33b`，Snapshot `61d17fb85f24b7d93f7397868214dd1f3bf0f7aa3026c00ad105ad1fee7960a2`。08-07零量观察不进入可执行Bar，盘中事实仍独立冻结；08-08买入、08-11卖出。

| 成交日期/方向 | 佣金 | 平台费 | 印花税 | SFC | 交易费 | AFRC |
| --- | --- | --- | --- | --- | --- | --- |
| 08-08买 | 15.00 | 15.00 | 50 | 1.35 | 2.82 | 0.07 |
| 08-11卖 | 11.36 | 15.00 | 38 | 1.02 | 2.14 | 0.06 |

总费用HKD151.82；期末现金及净值`87726.966373620141306778252860997627663373017128100726957803275`，持仓0，收益`-0.12273033626379858693`。每项以实际模拟成交额独立计算后取整，不把目标固定金额直接当作实际成交额；例如归一化40位数量精度下买入成交额略低于50000，AFRC两位halfUp为0.07。Python Decimal独立核对各项金额、预算约束、逐笔数量、所有4个净值点和策略收益。

基准使用同一冻结收费组合及各自日期/方向/金额：08-06收盘买入费用153.44，08-11收盘卖出费用223.76，净收益`0.49792015322358025992`，超额`-0.62065048948737884685`；预算搜索、份额及净值独立一致。这只是已声明的归一化基准，不赋予真实整手/价位资格。

当前Worker只读生产Runner两次重放完全一致；fetch/http/https/net/tls阻断且网络0。日志与冻结输入为`p6-expanded-hk-target.json`、`p6-expanded-hk-replay.json`、`p6-expanded-hk-independent.json`。

## 美股读取与消费者拒绝

入口`node scripts/public-fees-expansion-target.mjs --us-read --model-run=3b6018e8-506c-4846-bb59-66e3ee0f40ea`：当前Worker用已有Data Token向真实DSA鉴权HTTP读取，返回200、正确范围/来源修订及原件时钟，Section31按2024-05-20成交日切换、TAF保留actualShares/上限/低价语义。凭证不进入输出，没有文件/数据库写入。

随后在当前Worker中调用实际编译的`combinePublicFeesExecutionModelV3`，输入为真实响应和上述已保存归一化任务的冻结执行模型，明确抛出“实际股数公共收费不能绑定归一化数量”。`normalizedConsumerRejected=true`，`actualSharesExecutionQualified=false`；见`p6-expanded-us-reader.json`。模型的富途参考股价可换算佣金研究成本，不能赋予TAF实际股数口径。

TAF按实际股数、上限及低价豁免的算法由现有受控Schema/Domain/Server测试验证；没有用这些测试替代真实Provider价格、股数、标准任务、页面和下载。因此F1/F2合同及读取/拒绝验收通过，F3实际单位目标仍未通过。

## 实际页面、下载与兼容

Safari页面`http://127.0.0.1:5181/strategy/jobs/d555954d-a545-4845-aaf6-e5be5cf245a3`实际显示四项公共收费、印花税整港元进位、富途独立佣金/平台费、修正后的原件发布日期，以及归一化/未知单位边界。实际点击诊断下载：`/Users/yzin/Downloads/backtest-d555954d-a545-4845-aaf6-e5be5cf245a3-diagnostics-v2.json`，SHA-256 `7ec0cb5c6ee0752b922595e074008af8e7ca05b260a0110e70a71163afa70706`。完整文件与真实API/持久结果/实际客户端映射深比较一致，四费费率、取整、日期、摘要及券商成本均保留；见`p6-expanded-hk-download-check.json`。

更新前20条终态和更新后21条逐身份核对，旧result/Manifest摘要及checksum完全一致。当前15条成功V3（含本轮上市、退市、港股新增费项）各两次当前目标断网重放，全部维持持久checksum；网络调用0，未恢复数据库或回写结果。14条相邻/旧回归为`p6-extension-regression-<任务ID>.json`，新港股单独重放已包含在15条中。

最终一致性审查：P6-AC6/7及上市部分AC9已闭环；AC8合同、HK成交额收费及US不兼容拒绝已闭环，HK部分AC9已闭环。上市首日仅预热、CN基准仍不可用，港美真实单位/TAF实盘坐标、完整成本账单、严格PIT和F01保持独立。E1父项/F3和指定旧备份身份缺口未勾选，没有以新增相似任务替代缺失资产。本轮无提交、推送或发布。

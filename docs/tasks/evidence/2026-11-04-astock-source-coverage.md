# 来源覆盖与首批备用源核对证据

对应[任务](../../archive/tasks/2026-11-04-astock-source-coverage.md)、[规格](../../specs/2026-11-04-astock-source-coverage.md)及[覆盖与资格结论](../../reviews/2026-11-04-astock-source-coverage.md)。状态：34来源映射、四组实源语义、保护及最终归档核对通过。

## 基线和授权

用户确认执行“完整覆盖表＋财报三表、沪深两融、沪深龙虎榜、研报列表四组首批备源验证”。现有63类按原输入复用，无新的产品启用或自动切换。三仓开始时HEAD为 `da002744bd317b7754832c6ac41d169bcf005e27`／`dd26571509e842ab230c393f5f339911ea98425d`／`3f661df1deb3de894755dcc66e584abb4165d014`，原4690／8852／225文件及索引摘要保存于主仓忽略目录 `.recovery-artifacts/astock-source-coverage-20261104/source-before.json`。

外部固定提交 `bf447c1d05fa75eac907426601d602125c81a0cd`、SKILL blob `4b4c8d76f37479416adeb232ffc0a09596925e1f`，来源清单和协议摘录为 `upstream-reference.json`。仅作为数据参考，没有执行其关闭TLS、安装、自动重试或Agent指令；出处与许可由DSA既有说明承接。

## 固定读取与实际失败

维护入口为 infra 的 `scripts/public-reference-source-check.py`，执行目录为 `thesis-ledger-infra`，使用现有Python3.12与DSA现有依赖，`PYTHONDONTWRITEBYTECODE=1`。完整代表命令由本地 `run-initial-probes.py`／`run-follow-probes.py`保存；均使用 `--execute --date 2026-11-03 --output <绝对原件目录>`，首批证券为600519，深市请求为300750；后续深市龙虎榜严格使用父页中的000417。CLI本身退出0仅表示回执已保存，不等于来源成功。

首批8次：`backup-ths-debt`、`backup-ths-benefit`、`backup-ths-cash`、`backup-margin-sh`、`backup-margin-sz`、`backup-dragon-sh`、`backup-dragon-sz`、`backup-sina-reports`。前7条HTTP200取得原件；新浪HTTP302明确迁移，原响应及Location保留。`initial-source-summary.json`为摘要，每次有独占permit、JSON回执和body，不覆盖历史。

原件证实上交所实际页大小被限制2000，总数2017；深交所龙虎榜首屏10／46条且有指定证券／原因详情链接。依据这些响应，`follow-plan.json`记录4次必要后续：补上交所第二页17条；读取深交所同目录JSON见证日期／总数；读取000417的实际详情链接；将新浪已回显的迁移主机／路径／查询固定为HTTPS再读取。4次均200，`follow-source-summary.json`保存摘要。没有自动跟随HTTP、关闭TLS或重试原请求，数据接口总计12次，0 USD，无模型／通知调用。

上交所金额／数量单位另查[官方说明页面](https://www.sse.com.cn/market/othersdata/margin/detail/)，文档检索／读取与12次固定数据接口采证分开，摘要为 `sse-margin-unit-evidence.json`。

## 解析、反例与合同核对

DSA四个 `data_provider/reference_backup_*.py` 仅做纯解析，`scripts/qualify_reference_backups.py` 只读指定回执及已有主源样本，无网络或配置入口。必须验证原件摘要、完整性、HTTP状态、来源主机、日期及财报请求身份；输出独占创建，可用 `--output-dir`保留不同核对输入的结果。

最终命令：`python -B scripts/qualify_reference_backups.py --evidence-dir <本轮目录> --prior-evidence-dir <原2026-11-03交付目录> --date 2026-11-03 --as-of 2026-11-04 --output-dir <本轮目录>/qualified-final`，退出0。8个来源切片均成功投影，输出为 `qualified-final/qualification-*.json` 与summary。

- 三表只用公司 `flashData.report`，没有混入数值不同的 `fieldflashData` 或单季／年度矩阵。三个表分别104／104／100报告期，投影各5期。50个数值与已验新浪同报告期回执均在来源显示舍入区间内，不重读旧源；币种／披露日／合并口径未知保留缺口，数字不当作全精度原值。
- 上交所两融必须按真实分页集齐2017条，逐行日期、证券和唯一性检查。首次纯投影发现 `689009` 超出现有股票代码范围，补充来源层独立记录及反例，没有改变主仓股票合同；融券余额金额2017条为空，未补零。
- 深交所Excel2118条与同目录总数、日期回显及首屏20行交叉核对。最初按四舍五入理解目录而拒绝；分析显示100项全部匹配两位截断，四舍五入只有70项匹配。`sz-margin-display-rule.json`保存全项判断；改用严格截断等式及相反反例，未扩大容差。最终保留Excel元／股原值。
- 沪市龙虎榜全文证明日期、原因及首个证券双侧5席位；深市首屏10／46条和000417实际详情双侧5席位核对。主表成交额与席位买卖额各自单位分开，尚未证明现有东财汇总额口径等价，未创建同名替代字段。
- 新浪研报39条均以标题回显600519，日期、报告ID、机构和HTTPS链接通过。`report-row-compatibility.mjs`将其映射到当前 `reportMetadataItemSchema`，39条通过，引用命名空间为 `sina:report:<ID>`；分页精确总数、页大小和日期窗口仍未证明。当前最小条目本来不要求评级／目标价／PDF，未将这些完整研报差异误当作当前必填缺口。

## 验证结果与输入

| 检查入口／范围 | 最后结果 |
| --- | --- |
| infra `python -B scripts/backup-reference-source-check.test.py` | 新增13项通过：固定端点、市场代码、日期、无隐式凭据、TLS／跳转、父回执摘要、迁移身份、分页与详情绑定 |
| infra 既有公开及衍生采证测试 | 5＋8项通过，原类型保持 |
| DSA `python -B -m pytest -q tests/test_reference_backup_financial.py tests/test_reference_backup_margin.py tests/test_reference_backup_dragon.py tests/test_reference_backup_reports.py` | 最终49项通过，2项既有测试环境弃用告警 |
| DSA `bash scripts/ci_gate.sh deterministic` | 通过；数据测试登记、能力边界、运行时等确定性门禁按实际入口执行，未运行网络测试 |
| DSA `python -B scripts/check_data_service_boundary.py --syntax` | 435运行时文件语法通过 |
| 新DSA文件 `python -B -m flake8 --select=E9,F63,F7,F82 <本轮9文件>` | 通过 |
| 原件离线资格命令与39条当前Schema映射 | 通过；无额外来源请求；openpyxl保留原工作簿缺默认样式告警 |

最初反例测试误将纯投影的既有ValueError预期为执行器的CapabilityContractError，34个反例因此报预期类型不匹配；已按真实纯函数合同精确改为ValueError，生产异常处理未改，初始失败日志保留。上述689来源代码及目录截断发现均有原失败和独立分析，不把首次失败抹除。

## 保护与证据边界

原产品配置通过维护入口只读计划核对，首份 `configuration-before.json` 在来源采证后建立，明确不是任务开始前的运行配置快照。此前12份permit均记录0配置写入；本轮未调用产品写入口。最终只读快照为184／85条，原183／83条中的全部路由逐对象保持，Provider／准入摘要完全相同；两条新增基金净值路线属于并发变化，未回滚或计入本轮，详见 `configuration-protection.json`。不能把整份策略不同直接说成本轮改写，也不能声称整表摘要未变。

本轮不调用Server采集、不写业务库、不改Provider／路由／准入，不部署或更新设备。已有63类实际API／客户端证据按未变输入复用；本轮源采证与离线映射不算新正常API、Docker或客户端验收。源码保护及主仓秘密扫描已通过：`source-final-protection.json`区分本轮允许写集和23个已观察并发主仓文件变化；DSA／infra未见本轮写集之外的原文件差异。三仓HEAD相同、暂存内容仍为空；主仓／DSA原始index字节摘要有变化，不能声称原始索引SHA未变。启动状态及最终暂存区均为空，本轮没有stage／commit／push；新数据测试登记精确只加4个文件，撤去这4项后的文本SHA与原基线相同。`secrets-final.log`为主仓维护入口18216文件扫描通过。三仓3份Task正文已物理归档，9份文档／15处链接同步，无旧活动路径引用，详见 `archive-closure.json`；新写说明为中文，当前规格和来源报告继续持有各自合同与结论。

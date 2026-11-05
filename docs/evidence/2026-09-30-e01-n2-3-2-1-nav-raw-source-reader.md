# E01-N2.3.2.1 精确净值原文读取验收

## 任务边界与拆分

N2.3.2 原文读取、独立规则/日历和精确生产 API 为独立交付面，已拆成 N2.3.2.1/2/3。本叶只交付原文 Reader；N2.3.2 与 N2.3 父项不勾选。原完成条件保留，真实日期覆盖、研究证据、精确准入及 Server 冻结接线由后续叶验收。

## 实施结果

相邻 DSA 工作区新增 `data_provider/eastmoney_nav_evidence.py`，扩展 `data_provider/eastmoney_fund_nav.py`。精确入口为 `read_fund_nav_evidence`；显示入口 `read_fund_nav` 复用这一整批读取路径，继续生成原有四列，Efinance adapter 继续按日期升序归一。

- `NavRawEvidence`、响应页和记录为不可变数据类，页/记录集合为 tuple。记录保留来源页内顺序，没有擅自将源端顺序解释为已满足回测升序事实合同。
- 原生 `DWJZ` 只接受规范正十进制字符串，长精度和末尾零原样保留；不从源端浮点数补回字符串。逐条原文按顶层 `Datas` JSON 语法定位，保留空白、字段顺序、原生字段和数值词法。
- 全部页保留 UTF-8 原文和 SHA-256；记录保留日期、单位净值、页索引、完整原文及摘要。整批摘要绑定请求基金、来源端点、Reader 修订及页摘要。
- 真实 UTC `captured_at` 表示本批取得时刻，不是历史发布时间。Reader 修订为 `eastmoney-fund-nav-raw-v1`，也不代表源端历史版本。
- 沿用 TLS 校验、总量/页长度核验、重复日期拒绝、55 秒预算、100 页/100000 行上限与每页 4 MiB；新增整批 32 MiB 上限。任何一页失败不返回部分证据，无内部重试。
- 拒绝重复 JSON 字段、非法编码/JSON、非标准 JSON 数值、非法净值及晚于真实上海采集日的估值日期。
- 来源自报总量为零时保留完整空来源证据及显示空表语义；回测预期估值窗口非空时由后续生产者明确拒绝。

未提交的已测试源码摘要：

| 文件 | SHA-256 |
| --- | --- |
| DSA `data_provider/eastmoney_fund_nav.py` | `7e5244bb6c3f7f200f0ca48ce1d5b05398664dd7106c2e341a25479570eda5a9` |
| DSA `data_provider/eastmoney_nav_evidence.py` | `e173ef370024479ec452030fb13393c39bf88b1de9bed3b9270897834ab1d973` |

## 真实来源样本

宿主 `.venv` 通过生产 Reader 读取 `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNHisNetList`；探针仅记录请求与核验摘要，不替换网络响应，不修改 Policy、Admission 或业务数据库。两次均首次成功，TLS 校验开启，无重试。探针路径 `/private/tmp/e01-n2-3-2-1-nav-live-probe.py` 为临时本地验证文件。

| 基金代码 | UTC 采集时刻 | 来源总量/页数 | 来源日期范围 | 整批内容摘要 |
| --- | --- | --- | --- | --- |
| 110011 | 2026-09-30T14:45:02.019922+00:00 | 4410 / 5 | 2008-06-19 至 2026-09-30 | `099c4c313a68958c547dfb298aa90bbc8376bbba449cdc9844a617a57b28f5a3` |
| 118001 | 2026-09-30T14:45:03.423583+00:00 | 3900 / 4 | 2010-01-21 至 2026-09-29 | `1e77d74c3e89dcfc50e1277ef7dceb7eaab559aef3c264c0ecf0418c2d2f2913` |

独立重算全部页与逐条原文 SHA-256，均一致；逐条原文可定位到其来源响应页。9 月 8 至 15 日样本单位净值如下，末尾零保持来源表达：

| 估值日期 | 110011 | 118001 |
| --- | --- | --- |
| 2026-09-08 | `4.1454` | `1.7120` |
| 2026-09-09 | `4.1192` | `1.7070` |
| 2026-09-10 | `4.0781` | `1.6880` |
| 2026-09-11 | `4.0512` | `1.6710` |
| 2026-09-14 | `4.0451` | `1.6320` |
| 2026-09-15 | `4.0443` | `1.6210` |

该次全量响应包含基金历史时期数据；没有把当前 QDII 规则用于整个历史范围，也没有用返回日期推导完整估值/申赎日历或实际发布时间。

## 本地验证

输入范围：上述生产 Reader、证据类型、相关定向测试及 Efinance/日期/当前精确路由/Provider Runtime/契约/消费者边界。没有安装依赖，未修改 requirements 或部署配置。

| 检查 | 结果 |
| --- | --- |
| 既有分页及新增证据定向 | 初次 37 项通过；后续补充实际 Efinance adapter 精度回归 |
| 9 个相关测试文件合并回归 | 133 项通过 |
| 三个修改/新增 Python 文件 `py_compile` | 通过，字节码缓存定向到 `/private/tmp/e01-nav-source-pycache` |
| 相关源文件/测试完整 `flake8` | 通过 |
| 主仓 `scripts/check-boundaries.mjs` | 通过 |
| 两个工作区 `git diff --check` | 通过 |

最终回归命令（在 DSA 根目录）：

```sh
.venv/bin/python -B -m pytest tests/test_eastmoney_fund_nav.py tests/test_eastmoney_nav_evidence.py tests/test_thesis_ledger_nav_dates.py tests/test_thesis_ledger_current_data_route.py tests/test_thesis_ledger_provider_runtime.py tests/test_thesis_ledger_contract.py tests/test_thesis_ledger_data_v3_target_pins.py tests/test_efinance_realtime_quote.py tests/test_thesis_ledger_consumer_boundary.py -p no:cacheprovider -q --tb=short --disable-warnings
```

负例覆盖后续页总量变化、短页、重复/非法日期、错误响应、原文重复字段/非法编码、浮点及非法十进制、未来日期、页/整批字节预算与 TLS 失败；不会发布部分结果。真实 Efinance adapter 使用受控传输响应完成排序和长精度字符串保留验证。

首次 `py_compile` 因相邻工作区的 `__pycache__` 写权限失败；改用一次性缓存目录后通过。Pytest 使用 `-B` 与关闭缓存插件，未申请额外写权限。仅运行相关回归与静态门禁，未运行覆盖其他产品领域的 DSA 全量 CI；本叶没有新增公开 API、任务编排、认证或 fallback，现有净值路径和消费者边界已覆盖。

## 后续执行顺序

1. N2.3.2.2：独立规则与三类日期生产，补齐真实基金日历、暂停与适用区间。
2. N2.3.2.3：精确生产接口，生成所选模式的可见性证据并配对真实来源负例，核验准入。
3. N2.4：Server 精确 Reader 与准备，消费前述完成合同。

公开接口、严格 PIT、部署后的 DSA、Server/Worker 与客户端验收均未由本叶替代。

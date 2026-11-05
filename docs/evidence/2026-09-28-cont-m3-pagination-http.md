# M3 基金目录 HTTP 边界验证

日期：2026-09-28。任务：`R01.5-http-boundary-tests`。状态：本地测试叶完成；R01.5/Catalog/真实来源门禁保持开放。

## 变更与边界

唯一代码写集为 DSA `tests/test_eastmoney_fund_catalog_reader.py`；唯一说明性写集为本文。没有修改 parser/reader/消费者源码、能力目录、主 Task、CHANGELOG；未 stage/commit/revert。相关既有文件全部为未跟踪 WIP，保留原有内容与其他代理变更。

增加9个风险边界用例，mock的对象为 `requests.get`，每项直接执行实际 `_fetch_page`，不通过注入 fetch_page 绕过传输层。使用真实 `requests.Response` 的上下文管理行为及受控 iter_content/close，因此可以观察错误退出时是否调用关闭。全部零网络，响应内容明确为合成边界数据，不是来源原文。

- 2项预算/身份用例：精确 HTTPS endpoint、请求页与页大小、固定查询维度、Referer、stream、禁止重定向；剩余2秒及9秒分别传入 `(2,2)` 与 `(5,9)`。没有关闭 TLS验证，沿用 requests 默认验证；分chunk的UTF-8 BOM被正确解码。
- 2项状态用例：302与503在读取正文前拒绝，并关闭response，无第二次HTTP请求。
- 2项总大小用例：8个1 MiB chunk恰好8 MiB允许；再加1字节拒绝，成功/失败均关闭response。
- 1项非法UTF-8：有效前缀后的非法字节抛出UnicodeDecodeError，不返回部分文本，关闭response。
- 1项流中ReadTimeout：先收到部分正文再超时，抛出原错误并关闭response，不返回部分正文、不重试。
- 1项ConnectTimeout：尚未取得response时传播连接错误，只有一次HTTP调用。

发现需要源码修复的缺陷数量：0。没有新建来源分类合同或赋予目录/历史覆盖资格；单请求timeout仍不能代替生产Catalog的父进程硬期限。

## 输入与摘要

复用了 [实施前沿](2026-09-28-cont-m3-pagination-frontier.md) 中冻结的parser/reader合同；以下为本轮检查时实际输入摘要。parser、reader及parser测试与前沿记录一致，只有owned reader测试发生变化。

| DSA输入 | SHA-256 |
| --- | --- |
| `data_provider/eastmoney_fund_catalog_page.py` | `69bda56fd043649afacb22e36093d72c0f7789549a66f2239902e2fe757eed38` |
| `data_provider/eastmoney_fund_catalog_reader.py` | `34fc2ad04ce24e2a860214d6bf5c81d1313c09a4bca488a97574d13d030c762d` |
| `tests/test_eastmoney_fund_catalog_page.py` | `1c70ffdeff647458a8e10e9a76919c8765ba1600df51e0d60b8d4a0e50e7c58d` |
| `tests/test_eastmoney_fund_catalog_reader.py` 修改前 | `63149bf1177ff9a9bfa0c1106ce6a6c71b989b1ce3601f61f40e8370e9f85db3` |
| `tests/test_eastmoney_fund_catalog_reader.py` 修改后 | `76be1bc77e32f0950faa128b0e0fbb91da9c170888133d2fa3ac7118d04b74b1` |
| `setup.cfg` | `ab8e40ffc8e8d60f30e5533f2abd861cccfabae061bc662281607a466c85043c` |

## 实际检查

工作目录为 `/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis`，所有命令串行执行；没有高成本检查或后台会话。

| 命令 | 实际结果 |
| --- | --- |
| `rtk proxy .venv/bin/python -m pytest -q tests/test_eastmoney_fund_catalog_page.py tests/test_eastmoney_fund_catalog_reader.py` | 首次通过，28项：parser13、reader15（旧6+新9）；1.04秒，2项既有Starlette弃用警告 |
| `rtk proxy .venv/bin/python -m flake8 --select=E9,F63,F7,F82 tests/test_eastmoney_fund_catalog_reader.py` | 首次通过，退出0；限定关键错误，未声称完整风格检查 |
| `rtk proxy .venv/bin/python -m py_compile tests/test_eastmoney_fund_catalog_reader.py` | 首次通过，退出0；只有生成的本地编译缓存，无源码生成 |
| `rtk git diff --check -- tests/test_eastmoney_fund_catalog_reader.py` | 退出0；owned文件未跟踪，另外检查完整文件 |
| `rtk proxy git diff --no-index --check /dev/null tests/test_eastmoney_fund_catalog_reader.py` | 无空白错误输出，退出1表示相对空文件存在差异；覆盖未跟踪文件全部内容 |

检查没有失败，没有消耗卡点重试次数，也没有源码修复后需要追加的测试。说明文档另执行完整未跟踪文件的空白检查（无错误输出，退出1表示存在差异）及链接路径核对。

## 未验证与停止

未执行真实Provider、Catalog刷新、目录数据库、Server/Desktop消费、Docker同步/重建、浏览器、全量测试或构建。真实rankhandler完整读取已耗尽的首次+两次重试预算继续沿用；原879字节响应摘要只是历史观察，未重新获取或伪造原文。ETF/开放式基金分类、市场绑定、完整源端集合与历史目录均不由本次边界测试证明。

所有pytest/flake8/py_compile/只读检查命令均已退出，无后台进程、子代理或目标服务需要停止。当前叶停止，后继由协调者独立派发；不修改117编号SSOT或宣称M3完成。

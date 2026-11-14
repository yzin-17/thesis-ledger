# 失败行情口径上午复核证据

关联[规格](../specs/2026-11-12-provider-failed-recheck.md)与[任务](../tasks/2026-11-12-provider-failed-recheck.md)。本次有限复核过程完成，来源结果部分成功；不认证全部来源恢复，也不改变原四批漏采或晚启事实。

## 实际时间与范围对账

自动化于北京时间2026年11月12日10:00:34触发，10:00:41开始核对；来源读取实际发生于10:05:15～10:05:58，全部在本次10:15截止前，无顺延、重试或夜间计划。实际MarketSessionReader于10:02:57返回CN、HK为open、US为closed；每条来源查询之前再次读取同一服务端入口，六份会话回执均确认CN开市。

离线归并原中港四批最后回执及独立复试／AKShare启动修正回执，共26个精确绑定，最新18个成功、8个失败或未覆盖。已成功绑定本轮不重复。8个中，腾讯日线继续暂停，Yahoo港股历史日线离线排除，其余6个进入本次有限复核。历史失败和当前结果分别保留，不把最新成功反写历史失败，也不将本次计入原128次两阶段统计。

## 六个精确口径的实际结果

均为600519.SH、股票、不复权，查询2026年11月12日；每项一次逻辑查询。

| 来源／上游 | 周期 | 实际开始～完成（北京时间） | 结果 | 解释边界 |
| --- | --- | --- | --- | --- |
| AKShare／eastmoney | 1d | 10:05:15～10:05:18 | 成功 | 返回今日一根日线，不能据一次成功认证更新频率 |
| BaoStock／baostock | 1d | 10:05:18～10:05:21 | `not_covered` | 当日请求未取得覆盖，不等同于权限、网络或限流失败 |
| pytdx／pytdx | 1d | 10:05:21～10:05:44 | `upstream_failure` | 仅保留DataFetchError类型，本轮未保留足以进一步区分连接／解析原因的安全详情 |
| BaoStock／baostock | 60m | 10:05:44～10:05:47 | `not_covered` | 未覆盖当日小时线，未改查历史日期或试探参数 |
| pytdx／pytdx | 1m | 10:05:47～10:05:53 | `upstream_failure` | 没有取得可比较的OHLCV，当前不能认证恢复 |
| pytdx／pytdx | 60m | 10:05:53～10:05:58 | `upstream_failure` | 同上；不以昨日连接失败替代本次详细根因证据 |

AKShare原始末柱：时间`2026-11-12T00:00:00`，open=`1395.13`、high=`1398.08`、low=`1388.11`、close=`1393.0`、volume=`9811`、amount=`1367368713.0`，保持原始数值与单位，不擅自换算。`sourceConfirmation=null`、`adapterComplete=null`。没有同一运行代次内的第二次读取，不能比较同根变化或猜测确认／更新规则。柱日期不是请求时间，日柱时点也不证明数据时效。

预算实际为6／12：pytdx中国内地3／3，BaoStock中国内地2／3，AKShare中国内地1／3；其他来源市场为零。未出现明确限频、认证、权限或额度拒绝码；受控测试验证对应停止分支，但不能据此宣称来源没有限制。逻辑查询数不等于SDK底层网络尝试数，原SDK保护保留。

## 离线覆盖与美股间歇失败

Yahoo精确日线源码及目标容器文件摘要核对一致：`yahoo-hk-share-window`只覆盖00147.HK的2025-08-06～2025-08-11，`yahoo-gme-share-window`只覆盖GME.US的2024-05-10～2024-05-24。本次代表00700.HK、AAPL.US及当前日期不在其范围，属于明确能力边界；两项没有追加真实请求，不能据此评价Yahoo其他普通日线接口。

美股富途60分钟原四份回执已离线核对：前两次`invalid_response`，后两次成功；后两次同一纽约时间10:30柱的OHLCV及valueHash相同，close=`353.54`、volume=`4989907.47534`。四批属于同一原容器启动代次，后两次`sourceConfirmation=null`，`adapterComplete=false`，结论保持“间歇失败、成功样本未变化”，不认证只返回确认柱。本轮US会话closed，没有休市复试或新增美股请求。

腾讯日线没有新增请求、试参或部署，其原任务预算及最终真实读取缺口继续独立保留。AKShare／efinance分钟线等最新已成功绑定本轮零请求；昨日收盘后成功不能自动认证今日盘中全部可用。

## 运行代次与部署边界

六次读取前后DSA身份一致：容器`f43ca681b9fdf8db70d1624fe77f69bde28a8e835f423b43cf514d7bc2188b98`，镜像`sha256:f34796cac189c0b9866f8278273b2b690f57f71b2144f782eb99eae48e9740f4`，StartedAt=`2026-11-11T17:58:21.6605615Z`，即11月12日01:58:21北京时间。该启动时点不同于原美股四批，不跨代次进行行情变化比较。镜像未变不能证明容器可写层源码未变。

Server实际启动为11月12日03:02:01北京时间，镜像仍为`sha256:4a541fd6135c0ffd81aea7088e940bcbbb4b7edebb1a5c7f82266ddb7fe534ce`。当前DSA内已存在新增bar缓存控制模块；这与01:13记录的旧运行态有差异，本次未执行部署，不能确定其他任务的完整更新过程或门禁结果。文件存在不代表生产者、Redis缓存或整个功能正式验收通过，原D2／D3、C4／C5／C6保持未完成。

目标只读采样模块SHA256=`507044c967645775d9923ff0d5081995527e737a8be138bf727805dc352773f4`。六个绑定修订依次为`dsa-v3-stock-akshare-eastmoney-none-adapter-v1`、`dsa-v3-cn-stock-baostock-none-exact-daily-v1`、`dsa-v3-cn-stock-pytdx-none-exact-daily-v1`、`baostock-native-intraday-v1`、`pytdx-native-intraday-v1`、`pytdx-native-intraday-v1`。读取模块在请求前后复核精确绑定资格和凭证快照，无凭证原文落盘。

六份会话回执的CN日历修订均为`market-period-calendar-v1:b8ee89ea4f47db8701b0a89e78abb045ea623b3590fcdfcf5407f4aef67f8ac5`。HK为`market-period-calendar-v1:3877a125d1c095dc2bc872964a78b8ffdd234fe0be226c3f55627247ef69d213`，US为`market-period-calendar-v1:8a9c6b7cb84dbd9b3c80133b0f1b0340c3772d715f620140d5007277eea2dcc2`，不自行按星期或硬编码时段判断。

## 入口、受控验证与原始回执

新增入口属于DSA的`scripts/local-runtime/failed-provider-recheck.mjs`及配套Python载荷，宿主通过只读docker exec复用已部署模块；未复制文件到容器、未更新DSA、未拼接供应商HTTP。本次只保留许可和诊断回执，不使用Redis或业务写入口。

实际执行目录为`thesis-ledger-infra`，执行时参数如下：

```sh
node ../daily-stock-analysis/scripts/local-runtime/failed-provider-recheck.mjs \
  --history=/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/provider-intraday-20261111 \
  --output=/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/provider-failed-recheck-20261112-1000 \
  --not-before=2026-11-12T10:00:00+08:00 \
  --expires-at=2026-11-12T10:15:00+08:00
```

首次执行版本由入口直接执行，退出0。执行后已将可复用CLI收紧为默认零请求计划，后续执行必须另加`--execute`；实际命令及首次回执保留，不为验证开关重复真实请求。载荷最终改为通过argv传入精确口径，避免代码模板占位；该传参修正只做本地检查，没有再次读取来源。

定向命令`node --test scripts/local-runtime/failed-provider-recheck.test.mjs`最终4项通过，覆盖预算／重复／腾讯拒绝、未知会话及独占许可、过期窗口、额度拒绝后停止。同一路径不带执行开关的实际计划检查返回`readOnly=true`、`upstreamReads=0`、6个计划项、26个历史精确绑定，没有覆盖已有回执。最终Python载荷`ast.parse`语法检查及`.venv/bin/python -m flake8 scripts/local-runtime/failed-provider-recheck.py --select=E9,F63,F7,F82 --show-source`均退出0；未重跑未改变输入的全仓门禁，不以定向检查替代原23项失败的收敛。

原始证据在忽略目录`.recovery-artifacts/provider-failed-recheck-20261112-1000/`，目录700，文件600。包含`execution.permit`、`plan.json`、六个`query-*.permit`、六个`session-*.json`、六个`query-*.json`及`report.json`。已有许可时拒绝重发；本轮没有结果未知的执行。

`report.json`的SHA256为`ee6f29a3062805121fb76e48c7371ad3e23591c5d10b71d80e5f2e8dc5b97d84`。

## 分层结论与剩余缺口

- 本地／受控：宿主入口4项安全测试及默认计划零调用通过；不证明所有SDK网络行为。
- 真实来源：6次逻辑读取，1成功、2未覆盖、3失败；当前成功只限AKShare今日不复权日线。pytdx细分根因、BaoStock当日覆盖和未测试来源能力仍有缺口。
- 部署：本次未执行部署；当前容器已出现与01:13不同的启动及文件事实，需要缓存任务独立对账，不认证正式部署门禁通过。
- Redis／浏览器：本次未执行，原缓存任务对应验收保持未勾选；没有改缓存或业务数据。

一次性自动化`automation`已通过应用工具删除，返回`deleteStatus=deleted`；原`k`未恢复，没有重复创建计划。真实读取全部结束，没有继续采样的进程。活动任务与证据分开维护，保留三仓WIP，未创建Goal、分支或工作树，未提交、推送或交易。

最终一致性检查：新增中文标题、主仓及DSA活动任务引用的文件存在性通过；两仓本次写集的定向`git diff --check`均退出0。应用自动化文件已不存在，最终原始回执仍为六条且SHA256未变；已勾选叶与实际输入、结果及分层边界一致。

# 159516.SZ 预热窗口与 HiThink 环境接线

## 只读来源探针

用户再次确认授权 Key 位于宿主 `~/.zshrc`。本次以进程内字面值解析读取，未输出密钥、放入命令行参数、写入文件或发送到目标容器。沿当前 DSA `fetch_hithink_etf_daily_bars` 适配器，对 `159516.SZ` 的上海日期 `2026-04-30..2026-08-09`、`qfq` 发起 **1 次**只读请求，0 次重试；该范围由已选普通策略版本的 1 个预热交易日与保守日历缓冲决定，不是此前 `2026-05-16..08-09` 的同参重试。

结果：HTTP/业务层经适配器校验成功，返回 68 个日线 Bar，首日 `2026-04-30`、末日 `2026-08-07`。`exchange_calendars 4.13.2` 的 `XSHG` 在请求范围内也有 68 个交易日；以[深交所上市公告](https://www.szse.cn/disclosure/notice/fund/t20230724_602100.html)确认的 `2023-07-27` 上市日为独立身份输入，适配器核对后缺失、越界、重复日期各 0。响应指纹 `4813cb997cb033c4b515bcfd4a0ac746352de59541248d75120cd9f97759bf1d`。适配器仍将 `volume_unit`、`turnover_unit` 标为 `unknown`；未保留原始响应。先前 59 日目标窗口和本次 68 日完整窗口属于不同来源观察，不由指纹不同推断发生修订。

这补齐了本策略所需的保守预热日期覆盖证据，并证明当前宿主 Key 对该请求可用。深市与 XSHG 在更广历史上的日历等价、ETF 量额单位、复权价格基准/修订、来源完整性和持续权限仍未获授权准入；`G0-H-target`、`G0-H` 保持未通过。

## infra 环境接线

目标 DSA 只读目录此前显示 `hithink` 的 `credentialConfigured=false`；当前源码把 HiThink 页面旧式字符串凭据归为环境模式，宿主 Shell 变量不会自动进入已有容器。infra `compose.yml` 已增加可选 `HITHINK_API_KEY` 仅传 DSA，`.env.example` 留空，凭据说明已补充。真实值没有写入仓库或目标数据库，目标容器也尚未更新。

验证：以合成值渲染 Compose JSON，DSA 环境字段恰为合成值，Server 环境无此字段，共 5 项服务；`bash scripts/compose-contract.test.sh` 通过；两仓限定 `git diff --check` 通过。该合成值检查不证明目标凭据已加载。目标更新仍需 DSA 官方完整离线门禁、HiThink 精确准入与受支持的 infra 更新入口；当前 DSA V3 对 HiThink 返回 `not_admitted`，不能以密钥接线替代来源准入。

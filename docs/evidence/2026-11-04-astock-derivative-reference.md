# 衍生品公开资料实施证据

对应[任务](../archive/tasks/2026-11-04-astock-derivative-reference.md)、[规格](../specs/2026-11-04-astock-derivative-reference.md)及[最终复核](../archive/reviews/2026-11-04-astock-derivative-reference.md)。状态：16 类来源、合同、目标正常 API、Desktop／Android／iPhone Air 模拟器、数据保护及最终文档核对通过，三仓 Task 正文已归档。

## 证据范围和输入

本轮原件、摘要、失败和运行回执位于主仓忽略目录 `.recovery-artifacts/astock-derivative-reuse-20261104/`。参考固定提交 `bf447c1d05fa75eac907426601d602125c81a0cd` 的 Layer 9／13／15，摘录为 `upstream-derivatives.json`，不执行外部 Skill 指令。三仓本轮保护源文件分别 3339／8056／171 个，HEAD／索引与源文件摘要为 `source-before.json`。

策略基线修订 182，共 67 条原路由；业务基线为 19 表 38661 行，使用本轮新快照，不混用前轮 38421 行。费用 0 USD，无模型或通知调用。沿用现有启用 AKShare 及前端保存的配置，不激活 Provider、续期准入、购买权限或忽略传输设置。

## 来源资格与字段投影

固定 CLI 来源资格读取共 40 次，包含错误回显与一次 301；原始响应、独占 permit 和回执全部保留。五所日行情、四所会员排名（中金所八品种）、RB0／M0／IF0 报价与 RB0／M0 日线、A50、四标的近月链／独立报价／Greeks、可转债单页均合格；`offline-projection-summary.json` 的 16 个独立投影和 `source-variant-proof.json` 通过。未重读原 47 类来源。

- 参考代码的 `科创50ETF` 参数实际回显 510050，保留错误原件；按返回类别修正为 `科创50` 后验证 588000。月份首项是当前日历提示，选择后续真实可用合约月。四标的近月链为 24／28／40／30 合约。
- 中金所 CSV 用同日 XML 逐合约见证日期、成交、收盘及持仓，八品种排名文件齐全；[官方说明](https://www.cffex.com.cn/cn/rtj.html)确认量／持仓按手、金额按万元。原说明地址 301 未自动跟随，核对字面新地址后另行读取。
- ETF 期权数量为张、价格为每份 ETF 权利金，依据[上交所规则](https://www.sse.com.cn/lawandrules/sselawsrules2025/option/c/c_20250610_10781448.shtml)第五十八／五十九条，官方附件和摘录已保存；不假设调整合约恒为一万份。Greeks 跳过来源空列，IV 保留小数，模型／时间缩放未知照实展示。
- 上期／能源以同日对照区分；会员三套名单及郑商品种／合约层级分开；A50 保留 CHA50CFD。可转债保留未来上市／摘牌、未知状态、空值及单页边界，不扫描整表。

## 本地与合同验证

| 执行入口与输入 | 最后结果／原始日志 |
| --- | --- |
| DSA 现有 Python 3.12／pytest，新增衍生品及纯合同 | 54 项通过，含 16 项纯合同；`derivative-tests-first.log` |
| DSA 相关原 177 项、新 54 项及 Control V3 11 项 | 242 项通过、5 项既有告警；`dsa-regression-final.log` |
| 基金身份新旧解码入口及衍生品执行接缝 | 18 项通过（包含既有执行检查）；`akshare-compat-tests.log` |
| 主仓锁定 Vitest，Schema 包全部输入 | 1444 项通过、3 项既有跳过；`schemas-tests.log`；新合同单独覆盖 17 项 |
| API client 全部输入及 Server 资料接缝 | 185 项与 3 项通过；`api-client-tests.log`、`server-tests.log` |
| Schema／API client build，Desktop／Mobile 类型，Desktop 生产构建 | 全部通过；构建保留既有 chunk 提示 |
| 主仓严格 ESLint、模块／工作区依赖／可访问性及尺寸门禁 | 通过，尺寸仅 7 项既有告警 |
| DSA 运行时合同、431 文件语法及能力边界 | 通过；基金最后两文件另用 `compile` 检查且未写缓存 |
| infra 固定 CLI 与路由离线验证 | 采证 8 项新增＋5 项既有、Python 路由 3 项、Node 路由 3 项通过 |
| `catalog-parity.mjs` 与当前编译合同 | 63 类标签／列／单位／日期／作用域／来源／资产逐字段一致，29 份新实际回执通过；`catalog-parity-proof.json` |
| 原 47 份实际回执使用当前 Schema | 通过；`old-47-contract-proof.json`，旧来源请求 0 |
| `git diff --check -- <本轮既有源码路径>`、`node scripts/check-secrets.mjs` | 全部通过；秘密扫描 18190 文件，见各仓 diff 日志及 `secrets-final.log` |

相关 DSA 测试最初漏列既有 TickFlow／Alpha Vantage／Finnhub 就绪预期，并混用 TickFlow 无凭据的日线预期；现仅以合成凭据同步同一配置下的报价／日线断言。未修改这些 Provider 的运行代码或真实配置，修正前失败日志保留。目录一致性脚本首次误用未导出的 Schema 名称，修正为实际的 `marketReferenceResultSchema` 后通过，没有据此修改产品合同。

## 正式维护入口与目标运行

1. `sync-code.sh all` 因 DSA 兼容输入不一致拒绝，退出 1，未改容器；`target-sync.log` 保留。
2. `sync-code.sh thesis-ledger` 成功，Server／Worker 健康、镜像不变；`server-sync.log`。
3. `update.sh dsa` 首次因既有 `.venv/bin/python` 无效停在预取阶段。通过入口支持的 `LONG_BRIDGE_SOURCE_PYTHON` 使用现有 Python 3.12 和现有依赖路径，没有改用户 venv。
4. 完整构建安装 AKShare 1.20.25 后，API 导入 Smoke 揭示旧基金模块依赖 `fund_em` 偶然导出的 `demjson`。失败及入口自动缓存重试均保留，旧运行容器未被失败镜像替换。
5. 有界前置修复只改基金身份解码模块与定向测试，直接消费相应版本的 JSONish／旧解码模块及请求头定义，保持原端点、身份、原文摘要和预算。18 项检查通过后再经 `update.sh dsa` 成功构建，复用缓存，未关闭 Smoke；`dsa-full-update-compat-fixed.log`。

目标 `target-sdk-compat-proof.json` 确认 AKShare 1.20.25、`akshare.utils.jsonish` 实际解析、基金原文保真及目录 63。新 DSA 镜像为 `sha256:83e0f17bb6656f74187a642ee41c55fb43be68cc855714f6fa5c072f788f9975`；Server／Worker 仍为 `sha256:1654b11a1f4b39c94bfff670dec539b46e373af427cd8ea14c88da80a3622b45`。三服务健康，原三类挂载逐项一致；没有数据库重建或卷删除。

`market-reference-routes.mjs --mode=plan` 复核 16 条仅追加计划，后经同一 Server 条件策略 API 以修订 182 应用，形成修订 183、83 条路由，原 67 条不变，Provider／准入摘要一致。最终只读计划无新增／撤销；`new-routes-plan.json`、`new-routes-applied.json`、`route-final-proof.json`。

## 实际 API 与客户端

`live-derivative-reference.mjs` 通过正常 ThesisLedgerApiClient 执行 29 个用例，全部非空并通过当前关联校验；覆盖 16 类、四标的近月链与独立报价／Greeks、RB0／M0／IF0／RB2612 及 M0 日线。独立 `live-<用例>.json` 与 `live-summary.json` 保留请求、结果及耗时。以上是产品查询次数；一个产品查询可能有多个必要来源 HTTP，不能与固定资格读取 40 次混为同一计数。

- Desktop：生产构建在本轮本地 preview 中验收 16 类；3 类走当前 API，13 类回放本轮正常 API 实际结果并逐项核对请求，中文标签、来源与各列通过。`desktop-derivative-proof.json` 及代表截图保留。
- Android：当前 JS 的 16 类均经保存的 `http://10.0.2.2:3000/api/v1` 正常 API 读取，来源和首列可见。`android-derivative-proof.json`、逐类 XML 和代表截图保留。首次启动 UI 树未生成 XML，后续自动输入一次丢首字母，均在提交查询前停止；仅修正验收驱动的 UI 就绪与输入核对，保留失败日志并跳过已通过的 10 类，没有重复来源查询代替旧证据。
- iPhone Air 模拟器：原 `http://127.0.0.1:3000/api/v1` 保持，16 类均经当前 API 读取，期权张数／元每份字段可见。XCTest 一项包含 16 类，147.510 秒通过；`ios-derivative-reference.xcresult` 导出 33 份截图／树附件，汇总 `ios-derivative-proof.json`。

两端以本轮 ASCII minified JS 嵌入既有原生包并保留数据安装，Android 17 个原生库摘要与签名／嵌入字节核对通过，iOS 原生代码摘要保持。只编译 iOS 验收驱动，不声明应用 Native compile、实体设备、远端 CI 或商店发布。已人工查看 Desktop Greeks、Android Greeks 和 iOS 期权报价代表截图，字段／单位与来源可读。

## 保护结果与最终接续

`final-protection.py` 只读检查三仓 HEAD／索引、原源文件、目标镜像／挂载及业务原行；`source-final-proof.json`、`runtime-final-proof.json`、`business-final-proof.json` 通过。主仓改动 10 个既有源码，DSA 11 个，infra 3 个既有源码及测试产生的 2 个未跟踪 pyc；其余保护源文件不变。新增源码由上述定向测试和门禁覆盖，无 stage／commit／push／reset。

原 19 表 38661 行全部保全：18 表完整摘要一致；原 2292 个 AccountValuationPoint 按基线文件时间 2026-11-04T04:55:23.901343Z 切分，摘要一致。后台持续生成新估值点，最终保护快照时另有 170 行，保留未动；不以新增导致的整表摘要变化误判旧行丢失，也不回滚后台数据。完整摘要只存本地忽略目录，不写业务原文。

单一最终一致性复核已覆盖来源叶、资产／字段合同、正常 API、各端矩阵、构建前置修复、保护边界和文档。三仓 3 份 Task 正文已归档，9 份文档的 16 处入站／出站链接同步，移动后相对目标存在且无旧活动路径引用；`archive-closure.json` 保留检查。当前 Spec／指南／来源复核继续持有现行合同，活动目录不留壳。

# Cloudflare 模型目录适配验收记录

## 受控范围

本轮只修复模型目录读取，不发送模型生成请求。现有三个模型、凭据、Provider 停用状态、研究默认模型、V2 关闭及原余 2 次冻结保持。既有 WIP、业务数据和验收包保留，不 stage 或 commit。

## 根因与修复

正式接口 `POST /api/v1/ai/providers/models` 已复现 HTTP 502，消息为“获取 Provider 模型目录失败：Provider 模型接口返回 HTTP 405”。源码将兼容生成地址统一追加 `/models`。Cloudflare 目录实际使用原生 `/ai/models/search`，且模型可调用 ID 在 `name` 中；原生 `id` 是目录 UUID。

新增的 Server 适配器精确识别 Cloudflare 标准账户地址，按页读取文本生成模型并映射推理元数据。所有页共享总超时，拒绝重定向，限制总数及页数，错误和分页停滞直接失败。其他 Provider 继续使用原协议。前端请求和持久化契约不变。

## 当前证据

- [目标 API 修复前复现](../../../.recovery-artifacts/cloudflare-catalog-fix-20261026/reproduction.json)：502，内部 HTTP 405；模型调用 0。
- [定向测试](../../../.recovery-artifacts/cloudflare-catalog-fix-20261026/targeted-final.log)：两个文件、20 项通过，覆盖协议、名称和任务映射、分页、推理字段、主机边界、错误、总超时及数量限制。
- [前端现有目录草稿回归](../../../.recovery-artifacts/cloudflare-catalog-fix-20261026/desktop-targeted.log)：两个文件、8 项通过。
- Server 构建与 TypeScript 通过；[包级测试](../../../.recovery-artifacts/cloudflare-catalog-fix-20261026/server-tests.log) 为 425 个文件通过、68 个条件性跳过，3,490 项通过、356 项跳过。该命令移除了测试进程的真实模型 Key 与业务 `DATABASE_URL`，未用跳过项替代目录真实运行态验收。
- 全仓边界通过；复杂度 guardrails 通过并保留存量告警。尺寸门禁三项阻断及其修复见 [独立验收记录](2026-10-26-file-size-source-ownership.md)。测试拆分后，全部改动 TypeScript 文件的严格 lint 零告警，Desktop 类型检查及 38 项相关测试通过；其他 Server 输入未变，复用已通过的包级证据。

包级、门禁及以下真实运行态验收已通过。本主题解决目录读取的 405→502；没有发送生成请求，不据此关闭研究 G3。

## 正式入口与恢复记录

执行目录均为相邻 `thesis-ledger-infra`，更新目标始终选择最小 `thesis-ledger`。未修改任何依赖清单、数据库结构、配置或默认模型。

1. `./scripts/sync-code.sh thesis-ledger` 首次因沙箱拒绝 `ps` 在更新锁预检退出；未取得更新锁或变更 Docker。
2. 按工作区规则提权执行同一入口，宿主构建因 PATH 缺少 Node 失败；随后为本次进程显式提供已验证的 Volta／pnpm 路径及 npmmirror 配置，未修改宿主配置文件。
3. 后一次快更日志停留在宿主 Nest 构建阶段，工具会话中断后发现 Docker daemon 不可用且没有活动更新进程；该次未记为成功。
4. 使用仓库现有 `bash scripts/docker-desktop.sh start`，独立 `docker info` 检查通过，退出 0；没有清理资源。恢复后目标容器均为 Exited，快更正式预检拒绝执行，退出 1。
5. 按仓库规则切换 `./scripts/update.sh thesis-ledger`，默认保留数据模式。镜像构建因 Alpine 索引 TLS 错误失败，脚本自动重试后退出 1；没有把该次记为部署成功。
6. 按 [infra 依赖就绪规格](../../../../thesis-ledger-infra/docs/specs/2026-10-26-reused-server-dependencies.md)补齐已有镜像复用分支的退出依赖恢复，定向 shell 测试及语法检查通过；经 `REUSE_THESIS_LEDGER_IMAGE_ID=<原已验完整ID> ./scripts/update.sh thesis-ledger` 恢复，退出 0，数据库 check 模式通过，五个服务健康。该过程只恢复原镜像，不代表目录源码已经部署。
7. 运行 `sync-code.sh thesis-ledger`，产物复制后 Server 启动失败，正式入口自动回滚到同一原镜像，退出 1，两个消费者重新健康。随后用只读 Docker 退出事件监听捕获同一失败：宿主构建命令继承了保护日志用的 `umask 077`，产物目录为 700、文件为 600，容器 `thesis` 用户无法读取入口；这是本轮执行命令的问题。
8. 日志目录和文件继续保持私有权限，但正式构建／快更进程使用 `umask 022`。同一 `sync-code.sh thesis-ledger` 完整退出 0，两个消费者健康。[成功日志](../../../.recovery-artifacts/cloudflare-catalog-fix-20261026/sync-code-readable.log)；未改动产品配置或放宽兼容门禁。

入口进程只增加非敏感的工具 PATH、`COREPACK_NPM_REGISTRY`、`pnpm_config_registry` 和 `npm_config_registry`，均采用已有工具路径及 `https://registry.npmmirror.com`。完整日志保存在本主题私有验收目录，未在文档中复制密钥或实际 Cloudflare Account ID。

## 目标与保护验收

- [目标 API](../../../.recovery-artifacts/cloudflare-catalog-fix-20261026/target-api.json)：HTTP 201，39 个 Workers AI 文本模型，包含 `@cf/zai-org/glm-4.7-flash`，原三个模型保留。
- [运行态证明](../../../.recovery-artifacts/cloudflare-catalog-fix-20261026/runtime-proof.json)：Server／Worker 均匹配宿主编译后的两个目录模块；187 个来自当前 Schema 源码的实际模块一致，记录了实际解析路径。镜像 ID 保持原已验镜像，本轮为可写层快更，容器重建后必须重新通过正式入口应用代码。
- [浏览器记录](../../../.recovery-artifacts/cloudflare-catalog-fix-20261026/browser-verification.json)与[截图](../../../.recovery-artifacts/cloudflare-catalog-fix-20261026/browser-catalog.png)：独立 IAB 访问实际前端，点击“从接口获取”后显示“已选择 3/32 个；已获取 39 个可用模型”。仅关闭临时草稿，未保存、测试或启用；用户原浏览器草稿未操作。页面既有健康历史读取失败提示属于独立状态，本轮不声明整页所有查询正常。
- [保护反读](../../../.recovery-artifacts/cloudflare-catalog-fix-20261026/verification.json)：22 张受保护表（含完整 `ProviderConfig` 行及凭据密文）、旧 AI 历史、DSA 控制和准入、环境及 `.zshrc` 摘要一致。默认仍为 `openrouter/free`，设置修订 5，V2 关闭、`canCreate=false`、模型调用 0、余 2 次冻结。五个服务健康，原镜像和按目标路径规范化后的全部挂载一致。
- 原收尾脚本对整个 Provider API 响应求摘要，因响应包含 `executionRoutes[].readiness.evaluatedAt` 而不能作配置不变的断言。[两次纯 GET 的对照](../../../.recovery-artifacts/cloudflare-catalog-fix-20261026/provider-api-volatility.json)确认仅 9 个评估时间字段变化。基线未保存完整 API，不能声称整响应字节相同；数据保护以数据库完整行、研究设置及 Cloudflare 模型和修订的独立断言为准，未重置基线。
- [三仓 WIP 核对](../../../.recovery-artifacts/cloudflare-catalog-fix-20261026/closed-workspace-proof.json)：HEAD 保持，staged 均为 0，基线已有文件无缺失，配置文件摘要保持。观测到的并行移动端及凭据文档变化保留；本主题只修改目录适配、已确认的尺寸门禁和相关测试、文档，以及 infra 恢复分支。原验收快照与拆分前 30 个测试 AST 的保留证明见[尺寸门禁证据](2026-10-26-file-size-source-ownership.md)。

## Cloudflare 价格核对

核查日期为 2026-10-26。[价格清单与逐型号官方来源](../../../.recovery-artifacts/cloudflare-catalog-fix-20261026/cloudflare-pricing.json)覆盖用户提到的 7 个型号及现有三个已选型号，单位为美元／百万 token；没有修改保存的价格或模型选择。

Gemini 4 Argon、Muse Spark Open、Grok 4.7、Gemini 3.8 Flash、Qwen 3.8 Max 属于 Cloudflare 统一目录的第三方型号，需要[统一计费预付额度](https://developers.cloudflare.com/ai-gateway/features/unified-billing/)，充值另收 5% 手续费，不能使用 Workers AI 免费 Neurons。Argon 的当前半价到 2026-11-30，Grok 按 200K 阈值分档。MiniMax M3.1 Flash 在当前官方目录中未找到精确型号，不给出替代平台报价。

GLM-4.7-Flash、Qwen3.8-27B、Gemma 4-26B 和 Nemotron 3 Super 均有 Cloudflare 标价，可在 Workers Free 的标准计费路径使用[每日 10,000 Neurons 免费额度](https://developers.cloudflare.com/workers-ai/platform/pricing/)。这是额度内不收费，不是无限免费或单价为零；第三方目录与当前 39 个 Workers AI 文本候选的范围须区分。

## 后续确认的模型选择（2026-10-26）

目录修复及上述保全验收结束后，用户确认采用 GLM-4.7-Flash、Gemma 4-26B、Qwen3.8-27B。通过正式 `POST /api/v1/ai/providers` 将 Cloudflare 的 Nemotron 替换为 GLM，新增 GLM 官方标价，其余两款价格版本保持。保存前的验证计划为 0 次调用，保存返回 201；Provider 继续停用，没有执行用途。

[独立配置反读](../../../.recovery-artifacts/cloudflare-catalog-fix-20261026/selection-proof.json)确认三款模型已保存，Cloudflare 凭据密文、地址、连接及超时设置保持；其他 Provider、21 张其余受保护表、DSA、环境、研究默认值与修订保持，V2 关闭、模型调用 0、余 2 次冻结。该调整使用独立前后快照，未覆盖目录修复阶段的基线或验收证据。

## 过程记录

首次 Server 构建发现新增测试中两处 mock 调用参数可能为空的 TypeScript 错误。已补齐可空访问和信号实例断言，生产逻辑未因此变更；保留 [首次构建日志](../../../.recovery-artifacts/cloudflare-catalog-fix-20261026/server-build.log)，后续构建使用独立日志。

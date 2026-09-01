# Docker 构建缓存重试 Spec

## 背景与问题

ThesisLedger 的本地更新流程会同时构建 DSA 与 ThesisLedger 镜像。一次 DSA 前端构建命中了缺少 TypeScript 的历史 BuildKit 依赖层，直到执行前端构建才暴露为 `tsc: not found`。用户要求降低同类缓存状态对更新成功率的影响：DSA 恢复标准的 `npm ci` 依赖安装，首次更新失败后清理 BuildKit 缓存并完整重试一次。

## 目标

- DSA 前端构建使用不带 `--include` 参数的标准 `npm ci`。
- Docker daemon 可用且更新尝试首次失败时，更新脚本清理全部未使用的 BuildKit 缓存后，从更新流程起点完整重试一次。
- 成功路径继续复用 Docker 构建缓存；重试成功后正常输出服务状态。
- 缓存清理不删除数据卷，也不执行 `docker compose down`。

## 非目标

- 不为不同失败类型设计不同的自动修复策略。
- 不自动重试两次或更多次。
- 不在 Docker CLI 或 Docker daemon 不可用时尝试清理缓存。
- 不主动拉取基础镜像、不修改 Compose 配置，也不改变服务健康检查语义。

## 现状与约束

- `thesis-ledger-infra/scripts/update.sh` 是源码栈的更新入口，默认使用本地构建缓存。
- DSA Dockerfile 的前端 builder 由 npm 默认依赖选择规则决定安装内容，前端打包仍由后续 `npm run build` 执行。
- BuildKit 缓存由 Docker 运行环境共享；清理会影响其他项目的后续构建速度，但用户已明确选择首次失败后的自动清理与重试。
- Compose、镜像、持久卷与部署流程由 `thesis-ledger-infra` 负责；主仓只记录跨仓的可观察约束。

## 设计方案

DSA 的前端依赖安装使用标准 `npm ci`，不传递 `--include=dev`、`--include=optional` 或其他 `--include` 参数，也不额外断言 `tsc` 可执行。前端打包继续由后续 `npm run build` 负责。

更新脚本在 Docker CLI 与 daemon 预检成功后，以一次完整更新流程作为一次尝试。首次尝试失败时，脚本执行 `docker builder prune --all --force`，随后从拉取、构建、启动和健康检查的起点重试一次。第二次失败时直接返回第二次的失败状态，不再清理或重试。

配置文件缺失、无效环境变量、Docker CLI 缺失或 daemon 无法连接属于无法安全执行缓存清理的前置条件失败，保持立即失败。

## 对外行为或接口变化

- `./scripts/update.sh` 发生首次运行时错误后，会输出缓存清理与第二次尝试的提示。
- 若第二次仍失败，脚本返回非零退出码，且不会进行第三次尝试。
- 正常成功的更新不执行缓存清理。

## 数据、状态或兼容性影响

- 清理范围仅为未使用的 BuildKit 缓存；不删除 Docker volumes，不停止运行中的容器，也不执行全局 system prune。
- 首次失败时会丢失可回收的构建缓存，后续构建可能变慢；这是用户接受的重试代价。

## 测试策略

### 关键可观察行为

- 前端依赖层使用不带 `--include` 参数的标准 `npm ci`，且不额外执行 `tsc` 断言。
- 首次更新失败时恰好清理一次缓存并完整重试；首次成功时不清理；两次失败时不再重试。
- Docker 与环境配置前置条件失败时不执行清理。

### 优先测试层级

- Shell 语法检查与可控 Docker CLI 替身的脚本行为测试。
- Docker 可用且空间充足时的实际更新仍是运行时验收门禁，不在本次静态验证中执行。

### 需要新增的测试入口

- `thesis-ledger-infra/scripts/update.test.sh` 覆盖首次失败后重试、首次成功和两次失败。

## 风险与备选方案

- 备选方案是在每次更新前清理缓存。该方案会无条件失去增量构建收益，未采用。
- 备选方案是仅对特定构建错误重试。用户明确要求首次任意更新尝试失败后重试一次，未采用。
- 自动清理会影响共享 builder 的其他项目缓存；脚本仅清理 BuildKit 缓存，不扩展到镜像、容器、网络或数据卷。

## 未决问题

### Blocking

无。

### Non-blocking

无。

## 验收标准

- AC1：DSA 前端依赖安装使用不带 `--include` 参数的 `npm ci`，且安装层不包含 `tsc` 断言。
- AC2：Docker 与配置前置条件通过后，更新流程首次失败会清理一次全部未使用的 BuildKit 缓存，并完整重试一次。
- AC3：首次成功时不清理缓存；第二次失败时返回非零状态且不进行第三次尝试。
- AC4：重试机制不执行 `docker compose down`、不删除 Docker volumes，也不执行 `docker system prune`。

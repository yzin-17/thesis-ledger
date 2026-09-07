# Docker 更新可靠性与构建缓存 Spec

## 背景与问题

本地源码栈通过 `thesis-ledger-infra` 的一键更新脚本同时构建 DSA 与 ThesisLedger，并在构建后启动服务、等待健康检查。当前流程把构建失败、Compose 启动失败和应用健康检查失败视为同一类错误：首次失败后清理全部 BuildKit 缓存，再从构建起点重试两个应用镜像。

这种处理会把数据库 Schema 不兼容、应用启动异常等确定性故障放大为一次完整冷构建。DSA 镜像包含体积较大的 APT 与 Python 依赖层，缓存被清理后容易受到镜像源和网络波动影响，使真正的应用错误被更长的构建过程遮蔽。

即使应用层已经完全命中缓存，BuildKit 仍会为 Dockerfile frontend 与可变基础镜像 tag 查询 Docker Hub 元数据。本机网络异常时，单个 `node` 基础镜像的 tag 解析仍可能等待 90–120 秒，成为热缓存更新的主要耗时。

## 目标

- 将镜像构建、服务启动和健康检查划分为可区分的失败阶段。
- 构建重试保留已有缓存，服务启动或健康检查失败不得触发镜像重建。
- 允许只更新 DSA、只更新 ThesisLedger，默认行为继续更新两者。
- 缓存清理必须由使用者显式触发，并限定为磁盘空间不足的修复路径。
- 在本地 `update.sh` 路径中提高 APT、npm、pip 与 pnpm 依赖缓存跨构建复用的稳定性，不改变生产与 CI 的共享 Dockerfile。
- 仅在本地 `update.sh` 路径中注入 Aliyun Debian mirror 与 npmmirror；共享 Dockerfile 不再覆盖构建工具的默认软件源。
- 普通本地更新不依赖 Docker Hub 完成 Dockerfile frontend 或基础镜像 tag 元数据解析；显式刷新基础镜像时继续获取官方 tag 的最新内容。
- 保持数据卷、运行中无关服务和 fresh database lifecycle 的既有安全边界。

## 非目标

- 不自动删除、重建或迁移 PostgreSQL、Redis、DSA SQLite 数据卷。
- 不在本次引入远程 BuildKit cache、镜像仓库发布流程或新的基础镜像发布生命周期。
- 不配置 Docker daemon 全局 registry mirror，也不要求生产或 CI 使用本地开发别名。
- 不修改 npm/pnpm lockfile、应用运行时数据源、DashScope 等业务 Provider 配置。
- 不改变应用运行时依赖、业务 API、Compose 服务集合或固定镜像栈。
- 不替当前未提交的 Schema 变更决定 baseline 升版或开发卷重建策略。

## 现状与约束

- Compose 编排属于 `thesis-ledger-infra`，两个应用源码分别属于独立仓库。
- 基础镜像默认不主动刷新；只有显式设置 `PULL_BASE_IMAGES=true` 才使用 `--pull`。
- ADR-018 规定 `0.1.x` 使用 fresh database baseline；Schema 不兼容必须阻止应用启动，任何卷删除与重建都需要运维人员显式执行。
- 本地工作树可能包含未提交业务改动，更新流程不得切换分支、清理源码或覆盖工作树。
- DSA 的系统依赖与 Python 依赖层体积大，冷构建时的网络与磁盘压力明显高于普通源码增量构建。
- 两个 Dockerfile 与 `compose.dev.yml` 也可能被生产或 CI 构建入口复用；Docker Hub 延迟规避不得修改这些共享构建定义，只能由本地 `update.sh` 在单次执行期间注入。
- 共享 DSA Dockerfile 当前将 Debian 源替换为 Aliyun，共享 ThesisLedger Dockerfile 当前为 corepack、npm/pnpm 与 node-gyp 指定 npmmirror；使用者要求这些网络适配也只影响本地更新脚本。

## 设计方案

### 分阶段更新

更新流程依次执行预检、可选服务镜像拉取、应用镜像构建、服务启动和健康检查。每个阶段独立返回失败，不再使用覆盖整个流程的统一重试。

构建阶段最多自动重试一次，第二次构建复用第一次已经产生的 layer cache 与 cache mount。启动命令或健康检查失败后直接报告 Compose 状态和目标服务日志，不重新执行构建。

### 目标选择

脚本接受一个可选目标：`all`、`dsa` 或 `thesis-ledger`。省略目标等价于 `all`。构建、启动和健康等待只针对所选应用服务；Compose 仍按既有 `depends_on` 启动必要依赖。

### 缓存修复边界

脚本默认不执行任何 BuildKit cache prune。只有构建输出明确包含磁盘空间不足，并且使用者在本次调用中显式开启修复开关时，脚本才执行带最小空闲空间目标的 BuildKit cache 清理，然后进行唯一一次重试。

其他网络、编译或依赖错误不得触发缓存清理。清理范围不包含镜像、容器和数据卷。

### 依赖缓存

`update.sh` 生成的临时 DSA Dockerfile 为 npm、APT package archive、APT package lists 与 pip 使用稳定命名的 BuildKit cache mount。APT 获取索引和包时设置有限重试及连接超时，使单次镜像源抖动能够在构建步骤内恢复，同时保持最终失败可见。

`update.sh` 生成的临时 ThesisLedger Dockerfile 为 pnpm store 使用稳定命名的 BuildKit cache mount，并在依赖安装前复制全部 workspace package manifest。lockfile 或 workspace package manifest 变化时，已下载且内容寻址一致的包可以复用。共享 Dockerfile 保持本轮优化前的内容。

### 本地软件源

共享 DSA Dockerfile 不替换 Debian 基础镜像提供的默认源，共享 ThesisLedger Dockerfile 不设置 `COREPACK_NPM_REGISTRY`、`npm_config_registry` 或 `npm_config_disturl`，使生产、CI 与直接构建不受 Dockerfile 级国内 mirror 覆盖。包管理器仍遵循 lockfile 中既有的完整下载地址；本次不重写 lockfile。

`update.sh` 的临时 DSA Dockerfile 在执行 `apt-get update` 前把 `deb.debian.org` 替换为 Aliyun HTTPS mirror；临时 ThesisLedger Dockerfile 为 corepack、npm/pnpm 与 node-gyp 注入 npmmirror 环境变量。该转换与本地基础镜像、命名 cache 使用相同的精确行约定和提前失败保护。

### 本地基础镜像别名

共享 Dockerfile 保持原有 frontend 声明与官方 `node`、`python` 基础镜像引用，`compose.dev.yml` 不增加本地别名参数。生产、CI 和直接 Compose 构建继续使用仓库内的原始构建定义。

本地 `update.sh` 在临时目录复制当前共享 Dockerfile，只对临时副本移除外部 frontend 声明、把已确认的 `FROM` 引用替换为本地基础镜像别名，并注入前述本地依赖缓存优化；随后通过一次性 Compose override 让本次构建使用临时副本。脚本退出时删除临时文件，且不修改源码目录中的 Dockerfile 或 Compose 文件。若共享 Dockerfile 的受支持行发生变化，脚本应在拉取或构建前明确失败，避免以过期转换静默构建。

普通更新时，脚本优先复用别名；别名缺失但官方 tag 已在本机时只创建本地 tag；两者都不存在时进行首次必要拉取。`PULL_BASE_IMAGES=true` 时，脚本显式拉取官方 tag、刷新对应本地别名，再使用临时 Dockerfile 构建，不把 `--pull` 作用到本地别名。

本地别名存在时，普通更新不访问 Docker Hub 检查 tag 是否变化。基础镜像新版本只通过显式刷新进入本地构建，避免网络抖动影响每次源码更新。

## 对外行为或接口变化

- `./scripts/update.sh`：继续更新两个应用服务。
- `./scripts/update.sh dsa`：只构建、启动并等待 DSA。
- `./scripts/update.sh thesis-ledger`：只构建、启动并等待 ThesisLedger；必要依赖仍由 Compose 处理。
- 不支持的参数在任何构建或启动前失败，并输出用法。
- 磁盘空间不足时默认输出显式修复方式；只有本次调用开启缓存修复开关才执行有界清理。
- 普通 `update.sh` 调用使用本地基础镜像别名；首次缺少基础镜像时会执行必要拉取，后续不再远程解析官方 tag。
- `PULL_BASE_IMAGES=true ./scripts/update.sh` 显式拉取三个官方基础镜像 tag，更新本地别名后构建。
- 生产、CI、直接 `docker build` 与直接 `docker compose build` 不经过临时 override，继续使用共享 Dockerfile 的原有 frontend 和官方基础镜像 tag。
- 生产、CI 与直接构建不再由 Dockerfile 注入 Aliyun 或 npmmirror；构建工具使用基础镜像默认值和既有 lockfile，国内 mirror 的显式覆盖只在 `update.sh` 临时 Dockerfile 中生效。

## 数据、状态或兼容性影响

- 不修改数据模型与持久卷内容。
- 不停止或删除非目标服务；Compose 可能按依赖关系确保目标所需服务运行。
- 既有 `PULL_BASE_IMAGES`、`PULL_SERVICE_IMAGES`、`ENV_FILE` 与 `HEALTH_TIMEOUT_SECONDS` 保持兼容。
- 共享 Dockerfile 和 `compose.dev.yml` 不包含本地别名接入点；临时 Dockerfile 与 Compose override 只存在于 `update.sh` 单次执行期间，本地别名不进入生产构建入口或运行时镜像引用。
- 软件源选择只影响构建期依赖下载，不修改最终应用配置、业务 API 或数据卷；共享生产构建移除国内 mirror 后，其可用性和速度取决于官方软件源网络质量。
- fresh database baseline 不兼容仍表现为服务启动或健康检查失败，但不会再导致镜像缓存被清空。

## 测试策略

### 关键可观察行为

- 构建首次失败、第二次成功时共执行两次构建，且不清理缓存。
- 启动或健康检查失败时只构建一次，不进入第二轮更新。
- 单服务目标不会构建另一个应用镜像。
- 非法目标在 Docker 构建前失败。
- 磁盘空间不足只有在显式开启时触发有界 cache prune。
- 本地基础镜像别名已存在时，普通更新不执行 `docker pull`；别名缺失时只补齐缺失项。
- 显式刷新时先拉取三个官方基础镜像并更新别名，Compose 构建不再对本地别名执行 `--pull`。
- 共享 Dockerfile 保留本轮优化前的 frontend、官方 `FROM` 与依赖安装写法，共享 Compose 不包含别名 build args；本地构建临时副本移除 frontend、替换对应别名并注入命名依赖缓存。
- 共享 Dockerfile 不包含 Aliyun/npmmirror 构建配置；临时 DSA/ThesisLedger Dockerfile 分别注入 Aliyun Debian mirror 与 npmmirror。

### 优先测试层级

1. 使用 fake Docker 的更新脚本确定性行为测试。
2. Shell 语法、Compose 配置与 Dockerfile 静态检查。
3. 本地 Docker 热缓存构建，确认两个镜像均可完成构建且缓存挂载语法有效。

### 可复用的现有测试入口

- `thesis-ledger-infra/scripts/update.test.sh`
- `thesis-ledger-infra/scripts/compose-contract.test.sh`
- Docker Compose 的 `build` 与 `config` 命令。

### 需要新增的测试入口

不新增平行测试脚本；扩展既有更新脚本测试覆盖目标选择、阶段化失败与有界缓存修复。

### 关键边界与回归场景

- Docker daemon、环境文件和参数预检失败时不清理缓存。
- 构建确定性失败最多重试一次。
- Compose 启动失败、容器退出和健康超时不触发构建重试。
- 默认调用仍选择两个应用服务。
- 普通更新的构建日志不再出现外部 Dockerfile frontend，且基础镜像 metadata 从本地别名解析。
- 临时构建文件在成功和失败退出后均被清理，共享 Dockerfile 或 `FROM` 约定漂移时在任何拉取、构建与启动前失败。
- 软件源转换约定漂移时同样在拉取、构建与启动前失败；共享 Dockerfile 与临时 Dockerfile 的软件源边界由测试锁定。
- 首次安装、部分别名缺失及显式刷新路径保持确定性，单个失败不会留下指向错误镜像的别名。
- 任何失败路径都不删除数据卷。

## 风险与备选方案

- 命名 cache mount 仍存放在 Docker Desktop 的 BuildKit 存储中；使用者主动执行全量 prune 后仍会冷构建。远程 cache 能进一步改善这一点，但需要独立的仓库、容量、凭证和失效策略，本次不引入。
- APT 列表缓存可能长期存在，但每次实际执行该层仍运行 `apt-get update`；基础镜像和 Dockerfile 层命中时不会访问网络。
- 顺序构建可以精确定位单个镜像失败，但会失去 Compose 并行构建收益。本次保留同一 Compose build 中的并行能力，通过目标参数和阶段化报告控制重试范围。
- 本地别名不会自动跟随官方 tag 更新，可能错过上游安全修复；使用者应在网络可用的受控窗口显式设置 `PULL_BASE_IMAGES=true`，并对刷新后的镜像执行同一健康验证。
- 临时 Dockerfile 的替换依赖共享 Dockerfile 中受测试保护的精确 frontend 与 `FROM` 约定；上游调整基础镜像时需要同步更新脚本映射，否则本地更新会提前失败。
- 直接运行 `docker compose build` 而不经过更新脚本时保持原有生产构建语义，因此仍可能受 Docker Hub frontend 与 tag 元数据延迟影响；本地快速更新入口以 `update.sh` 为准。
- 生产和 CI 移除 Dockerfile 级国内 mirror 后，在默认源网络较差的环境中冷构建可能更慢或失败；此外，既有 lockfile 若固定了完整下载地址，包管理器仍可能访问其中记录的 host。本次不扩展为 lockfile 迁移。

## 未决问题

### Blocking

无。

### Non-blocking

无。

## 验收标准

- AC1：默认调用更新两个应用服务，传入 `dsa` 或 `thesis-ledger` 时只构建和等待对应服务，非法目标在构建前失败。
- AC2：镜像构建最多自动重试一次，重试保留已有 BuildKit cache；普通失败不得执行 cache prune。
- AC3：Compose 启动失败或应用健康检查失败时不重新构建，并输出可定位失败阶段的状态与日志。
- AC4：只有检测到磁盘空间不足且使用者显式开启修复时，才执行带最小空闲空间目标的 BuildKit cache 清理；不删除镜像、容器或数据卷。
- AC5：`update.sh` 的临时 Dockerfile 为 DSA 的 npm、APT lists、APT archives、pip 以及 ThesisLedger 的 pnpm store 使用稳定命名的 BuildKit cache mount，并能完成实际构建；共享 Dockerfile 保持本轮优化前的依赖安装写法。
- AC6：既有环境参数、基础镜像刷新语义、Compose 服务集合和 fresh database lifecycle 保持兼容，运维文档与脚本行为一致。
- AC7：普通本地更新在基础镜像别名已存在时不执行 Docker Hub 拉取或解析官方 tag；别名缺失时能从本机官方镜像补齐，首次无镜像时执行必要拉取；显式刷新会拉取三个官方 tag、更新别名并完成构建；共享 Dockerfile 与 Compose 保持原有生产构建定义，只有 `update.sh` 的临时构建副本移除 frontend 并使用本地别名，且临时文件在退出后清理。
- AC8：共享 DSA 与 ThesisLedger Dockerfile 不包含 Aliyun 或 npmmirror 构建配置；`update.sh` 的临时 Dockerfile 分别注入 Aliyun Debian mirror 与 npmmirror，并通过脚本测试和真实构建验证；既有 lockfile 不在本次修改范围内。

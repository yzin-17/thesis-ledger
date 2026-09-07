# Docker 更新可靠性与构建缓存实施任务

对应 Spec：[`../specs/2026-09-07-docker-update-reliability-and-cache.md`](../specs/2026-09-07-docker-update-reliability-and-cache.md)

## 任务

- [x] T1：完成分阶段、可定向的一键更新闭环
  - 覆盖验收标准：AC1、AC2、AC3、AC4、AC6
  - 依赖：无
  - 涉及范围：`../thesis-ledger-infra/scripts/update.sh`、fake Docker、更新脚本测试与 Docker 更新运维文档。
  - 完成条件：脚本支持 `all`、`dsa`、`thesis-ledger`；构建重试不清缓存；启动与健康失败不重建；磁盘不足仅在显式开关下执行有界 BuildKit cache 清理；既有环境参数兼容。
  - 验证方式：运行 `bash -n scripts/update.sh scripts/update.test.sh scripts/test-support/fake-docker.sh`、`./scripts/update.test.sh`、`docker compose ... config -q`，并检查文档命令与实际参数一致。
  - 验证证据：
    - `bash -n scripts/update.sh scripts/update.test.sh scripts/test-support/fake-docker.sh`：通过。
    - `bash scripts/update.test.sh`：通过，覆盖默认/单服务目标、普通构建重试、启动与健康失败、磁盘不足授权边界及 `--pull` 兼容行为。
    - `docker compose --env-file .env.example -f compose.yml -f compose.dev.yml config -q`：通过。
    - `git diff --check`：`thesis-ledger-infra` 相关改动通过。
    - 现有 PostgreSQL 卷因 current baseline 已变化而出现 `P2022` 后，经使用者明确授权，先完成自定义格式备份与校验，再仅重建 `thesis-ledger-postgres-data`；重建后四个长期服务全部健康，`/api/v1/health` 返回 `status=healthy`，且依赖状态均为 `healthy`。

- [x] T2：在 `update.sh` 临时 Dockerfile 中稳定复用依赖缓存
  - 覆盖验收标准：AC5、AC6
  - 依赖：无
  - 涉及范围：恢复 `../daily-stock-analysis/docker/Dockerfile` 与 `infra/docker/server.Dockerfile` 的本轮前状态；修改 `../thesis-ledger-infra/scripts/update.sh`、fake Docker、脚本测试与运维文档。
  - 完成条件：共享 Dockerfile 不包含本轮依赖缓存改动；临时 DSA Dockerfile 为 npm、APT lists、APT archives、pip 使用稳定命名 cache mount，并为 APT 设置有限重试与超时；临时 ThesisLedger Dockerfile 复制全部 workspace manifest 并为 pnpm store 使用稳定命名 cache mount；运行时依赖与业务行为不变。
  - 验证方式：使用 fake Docker 断言共享与临时 Dockerfile 的差异，通过真实 `update.sh all` 构建两个目标镜像并复验热缓存，确认共享 Dockerfile 相对本轮前无差异。
  - 验证证据：
    - 范围 diff 确认共享 Dockerfile 不包含本地别名或命名 cache；`compose.dev.yml` 无差异。T4 后续明确移除共享 Dockerfile 中原有的国内 mirror，不影响本任务的缓存隔离结论。
    - `bash scripts/update.test.sh`：通过；fake Docker 逐项确认临时 DSA Dockerfile 的 npm、APT lists、APT archives、pip cache 与 APT 重试，临时 ThesisLedger Dockerfile 的四个补充 workspace manifest 与 pnpm store cache，同时断言共享 Dockerfile 不包含这些本地优化。
    - 严格收口后的真实 `./scripts/update.sh all`：两个临时 Dockerfile 均由 Compose 成功加载；DSA 全部构建层命中 `CACHED`，ThesisLedger 依赖安装层命中 `CACHED`，后续因任务文档变化从 `COPY . .` 开始正常重建；最终四个服务全部健康。

- [x] T3：使用 `update.sh` 临时构建文件隔离远端解析
  - 覆盖验收标准：AC6、AC7
  - 依赖：T1
  - 涉及范围：恢复两个共享 Dockerfile 与 `compose.dev.yml` 的原有 frontend/基础镜像写法；修改 `scripts/update.sh`、fake Docker、更新脚本测试与 Docker 更新运维文档。
  - 完成条件：共享构建定义不包含本地别名接入点；普通更新复用或按需补齐本地别名，在临时 Dockerfile 中移除 frontend、替换 `FROM`，并通过一次性 Compose override 构建；显式刷新先拉取三个官方 tag 再更新别名；脚本退出后清理临时文件，源文件约定漂移时提前失败。
  - 验证方式：扩展 fake Docker 测试覆盖临时 Dockerfile/override 内容、清理、别名已存在、从本机 tag 补齐、首次拉取、单服务目标、显式刷新和源文件漂移；执行 Shell/Compose 静态检查、真实热缓存更新，并记录 metadata 解析和运行健康结果。
  - 验证证据：
    - `bash -n scripts/update.sh scripts/update.test.sh scripts/test-support/fake-docker.sh`：通过。
    - `bash scripts/update.test.sh`：通过；确认共享 Dockerfile/Compose 保留官方写法，临时 DSA Dockerfile 移除 frontend，三个临时 `FROM` 使用对应本地别名，并覆盖成功/失败清理、共享 Dockerfile 约定漂移提前失败、已有别名零拉取、首次补齐、显式刷新和单服务范围。
    - `bash scripts/compose-contract.test.sh` 与 `docker compose --env-file .env.example -f compose.yml -f compose.dev.yml config -q`：通过。
    - 真实 `./scripts/update.sh all`：临时绝对路径 Dockerfile 与 Compose override 可被 Docker Compose 正常使用；三个本地基础镜像 metadata 均为 0.0–0.1 秒，未解析 `docker/dockerfile:1.7`，构建与启动完成后四个服务全部健康。
    - 紧接着无文件变化再次执行 `./scripts/update.sh all`：三个 metadata 均为 0.0 秒，全部构建层命中 `CACHED`，完整构建、启动和健康等待约 8 秒完成。
    - Prettier、三个仓库的范围内 `git diff --check`：通过；真实执行和 fake Docker 测试退出后均未留下 `thesis-ledger-local-build.*` 临时目录。

- [x] T4：把 Aliyun 与 npmmirror 软件源收口到本地更新路径
  - 覆盖验收标准：AC6、AC8
  - 依赖：T3
  - 涉及范围：`../daily-stock-analysis/docker/Dockerfile`、`infra/docker/server.Dockerfile`、`../thesis-ledger-infra/scripts/update.sh`、fake Docker、脚本测试与运维文档。
  - 完成条件：共享 DSA Dockerfile 使用 Debian 官方源，共享 ThesisLedger Dockerfile 不设置 npmmirror；`update.sh` 的临时 DSA Dockerfile 注入 Aliyun Debian mirror，临时 ThesisLedger Dockerfile 注入 corepack、npm/pnpm 与 node-gyp 的 npmmirror 配置；源码转换约定漂移时提前失败。
  - 验证方式：使用 fake Docker 断言共享与临时 Dockerfile 的软件源边界；执行 Shell、Compose、格式和范围 diff 检查；真实运行 `update.sh all` 并确认两个镜像完成构建、三个基础镜像 metadata 保持本地解析且服务健康。
  - 验证证据：
    - `bash scripts/update.test.sh`：通过；共享两个 Dockerfile 的 `aliyun|npmmirror` 匹配数均为零，临时 DSA Dockerfile 包含 Aliyun Debian mirror，临时 ThesisLedger Dockerfile 包含 corepack、npm/pnpm 与 node-gyp 的三项 npmmirror 配置。
    - 严格收口后的真实 `./scripts/update.sh all`：临时 DSA 的 Aliyun APT 层和临时 ThesisLedger 的 pnpm store 层均命中 `CACHED`，三个本地基础镜像 metadata 均为 0.0–0.1 秒；两个应用镜像构建成功，四个服务最终全部健康。
    - 业务 Provider、DashScope 配置及既有 lockfile 均未修改；范围内 Shell、Compose、Prettier 与 `git diff --check` 验证通过。

## 最终一致性 Review

- [x] Spec 中的全部验收标准均有对应实现
- [x] 所有已勾选任务均有验证证据
- [x] 所有任务依赖均已满足且无错误阻塞关系
- [x] 跨任务接口、类型和命名保持一致（如适用）
- [x] 不存在未解决的 Blocking 问题、占位描述或未定义的实现契约
- [x] 实现未超出 Spec 声明的范围
- [x] 测试策略、测试实现与验证结果一致
- [x] 测试与文档已同步更新
- [x] 必要实施 Step 均已验证；如已获提交授权，已形成合理 commit，否则已记录提交状态或建议边界
- [x] 未发现实现、Spec 与任务文档之间的不一致

### Review 结论

- 结论：Ready。AC1–AC8 均已实现并取得脚本测试、Compose 契约、共享/临时 Dockerfile 边界、真实构建和四服务运行验收证据；Docker Hub 延迟规避、命名依赖缓存、Aliyun 与 npmmirror 都仅由 `update.sh` 临时注入，共享 Dockerfile/Compose 不包含这些本地覆盖。本轮未获提交授权，改动保持未提交状态。
- 发现的问题：首次实跑发现现有 PostgreSQL 卷缺少 `AutomationJob.systemKey`，服务以 Prisma `P2022` 退出；经使用者明确授权后完成备份、精确重建与运行复验。后续热缓存构建又观察到外部 Dockerfile frontend 约 120 秒、官方基础镜像 tag metadata 约 90–120 秒的远端等待；现已由 `update.sh` 的临时 Dockerfile 与本地基础镜像别名隔离，共享生产构建定义不再为此改变。
- 遗留风险：本地别名不会自动接收官方基础镜像更新，应在网络可用的受控窗口显式运行 `PULL_BASE_IMAGES=true`；该刷新分支已通过 fake Docker 确定性验证，本轮未主动执行真实远端拉取。共享 Dockerfile 更新 frontend、基础镜像或受转换的依赖安装行时，`update.sh` 会提前失败，需同步调整受测试保护的转换。直接运行 `docker compose build` 不经过更新脚本时使用默认软件源，冷构建质量取决于相应网络；既有 lockfile 中的完整下载地址仍保持原样。旧卷业务数据未自动回灌；其自定义格式备份位于仓库外的临时目录，如需长期保存或选择性迁移，应转移到持久化备份位置并在隔离环境验证恢复流程。current baseline 的后续 Schema 变化仍须同步提升版本门禁。
- 验证命令与结果：`bash -n`、`bash scripts/update.test.sh`、`bash scripts/compose-contract.test.sh`、`docker compose ... config -q`、真实 `update.sh all`、Prettier 与三个仓库的范围内 `git diff --check` 均通过；稳定更新中三个本地基础镜像 metadata 均为 0.0 秒、所有构建层均命中 `CACHED`、完整流程约 8 秒，四服务全部健康；成功与失败退出均清理临时构建文件，数据库字段、索引、健康接口及备份校验的既有证据继续有效。

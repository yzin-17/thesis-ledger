# 旧路由继承整理验收

状态：通过。规格见 [旧路由继承无损整理](../specs/2026-11-10-routing-legacy-inheritance.md)，任务见 [实施清单](../archive/tasks/2026-11-10-routing-legacy-inheritance.md)。

## 当前实现

Market 的 `normalizeRoutingInheritance` 将旧获胜汇总规则按已纳入能力展开为精确项，保留大类及原有精确项、主备顺序、具体来源绑定和明确未配置。可信保留绑定随新获胜规则对齐，同目录编译语义保持；读取不写回。读取、预览及保存共用整理流程，旧请求也不能恢复隐藏继承层或伪造保留来源。

共享 Schema 维护精确范围形状，读取及预览增加兼容默认值为 0 的 `legacyRuleCount`。客户端通过待整理提示允许干净草稿预览保存，预览区分别显示整理数量及来源变化。恢复继承直接回到大类；大类选项只选择提供方，避免形成协议不允许的大类具体来源绑定，精确项继续支持具体来源。

本轮不改数据库结构、DSA、运行时依赖或精确路由协议。已有历史及冻结记录不经过当前编辑投影整理。

## 定向与包级检查

- Schema 构建通过；Market 整理、编译、服务、策略存储及修订定向共 5 文件、27 项通过。覆盖幂等、编译等价、多接口和不可用来源、旧空配置不复活、精确例外保留、删除单项后直接继承大类、新目录不自动纳入、旧请求和伪造保留绑定。日志 `/tmp/routing-inheritance-server-tests.log`，前期投影和服务检查分别为 `/tmp/routing-inheritance-{normalization,service}-tests.log`。
- Desktop 相关 5 文件、21 项通过，覆盖共享草稿、待整理但未改来源时允许预览、失败保留状态、成功重新读取并清除待整理标志、合法大类选择和精确绑定。日志 `/tmp/routing-inheritance-desktop-tests.log`。
- API Client、Server、Desktop 构建通过，包含 TypeScript 检查。日志 `/tmp/routing-inheritance-{schemas,client,server,desktop}-build.log`。修改源码和测试严格 ESLint 通过，复杂度上限 20；边界、文件规模及差异卫生通过，保留 6 项既有大文件和前端原包体积警告。日志 `/tmp/routing-inheritance-{eslint,boundaries,size}.log`。

## 隔离 PostgreSQL

通过主仓维护入口 `node scripts/test-market-routing-postgres.mjs` 启动完整迁移的独立临时数据库并清理，4 项测试通过。验证旧元数据只在保存时落库、原精确来源保持、旧历史内容不改、并发仅一个修订胜出、应用超时保留新元数据后可重试、事务约束失败回滚当前规则与来源。DSA 应用使用受控客户端，不连接真实提供方或共享业务数据库。日志 `/tmp/routing-inheritance-postgres.log`。

## 真实运行态

在相邻 `thesis-ledger-infra` 目录执行维护入口 `./scripts/sync-code.sh thesis-ledger`，仅将 Node 24.22.1 的安装目录加入本次命令 PATH。兼容性预检通过，命令退出 0；Server 和 Backtest Worker 重新启动并健康，镜像 ID 均保持 `sha256:818afb6662fc6103edd1f4a27ba741fbdb21c76e7152e6e084d5629bcf7e976e`。未变更数据库结构或卷，日志 `/tmp/routing-inheritance-sync.log`。该同步位于容器可写层，容器重建后会消失，不作为镜像已更新或生产发布证据。

同步前只读基线为修订 194、117 条实际路由、58 条规则，其中 26 条为旧汇总规则。同步后读取仍为修订 194、117 条实际路由，编辑投影为 85 条规则、152 能力键，当前规则中隐藏汇总项为 0。新投影及原旧配置分别提交原样预览，均保留全部 117 条精确主备及具体来源，来源变化 0、待整理数 26；所有真实 PUT 为 0。基线 `/tmp/routing-inheritance-baseline.json`，结果 `/tmp/routing-inheritance-runtime-result.json`，日志 `/tmp/routing-inheritance-runtime.log`。

初次运行态验证把省略的路由 `enabled` 与显式 `true` 按字面比较，产生错误断言；按协议的默认启用语义归一后通过。该修正只发生在验证脚本，业务源代码和策略没有因此改动。

## 实际浏览器

新增维护脚本 `apps/desktop/scripts/check-routing-inheritance.cjs`，通过 Playwright 和本机 Edge 在 1440、1024、768、390 全部通过：

- 规范化读取只有大类和精确项，页面不再显示旧“跟随周期/用途”状态；恢复精确项后显示“继承大类配置”，预览诊断的继承来源明确为大类，只有该项出现来源变化。
- 未编辑来源的干净草稿也可进入预览，显示整理 26 项旧规则及 0 项来源变化。受控 503 后同一请求重试成功，随后受控读取清零待整理标志，预览按钮恢复禁用。
- 每宽度恢复继承样本 1 项预览变化、真实保存 0；仅整理样本 0 项来源变化、2 次受控保存，真实写入 0、浏览器错误 0。页面和面板无越界，桌面恢复继承及窄屏预览截图已实际查看。

结果 `/tmp/routing-inheritance-qa/results.json`，截图 `{restore,preview}-{1440,1024,768,390}.png` 位于同目录，日志 `/tmp/routing-inheritance-browser.log`。复用原路由浏览器流程也在四宽度全部通过，涵盖具体来源及能力过滤、组合修改、统一预览与失败恢复；结果 `/tmp/routing-inheritance-flow-qa/results.json`，日志 `/tmp/routing-inheritance-flow-browser.log`。所有 PUT 保存均由浏览器拦截，390px 原流程沿用受控不适用来源及待确认标志。

## 最终结论

AC1–AC5 通过，现行规格、客户端和服务端合同一致，历史资料保留原记录。真实编辑读取已修复隐藏继承；真实数据库仍保留原元数据，用户通过统一预览保存后完成持久化整理。当前来源及历史没有被自动切换或改写，未提交或推送。验收限本轮写集，不扩大为共享工作区其他任务的全仓结论。

# 资料正文快照与版本差异验收

对应[规格](../specs/2026-11-10-rule-monitor-snapshots.md)和[归档任务](../archive/tasks/2026-11-10-rule-monitor-snapshots.md)。

## 实现与数据边界

DSA 在既有观察事务中新增 `version_snapshots` 表，SQLite `user_version` 从 3 升至 4。既有版本、任务、配置及历史保留，重复观察不覆盖可用快照；晚到和失败结果不能提交。旧记录再次观察到相同指纹时，保存的是新观察时点的正文，不把采集时间回填到旧的首次观察时间。

HTML 记录主体分段及参与原摘要的引用链接；DOCX 记录段落；PDF 使用已有 `pypdf==6.19.0` 的独立进程提取文字；资料包记录当次 JSON。HTML/DOCX 原摘要算法保持兼容，PDF 和资料包仍按原始字节计算指纹。HTML 纯文本和 JSON 仅作为文字渲染。

正文上限 250,000 个 UTF-16 代码单元；PDF 进程超时 6 秒、CPU 5 秒，Linux 地址空间 512 MiB，上限 100 页和 16 MiB 解压内容。扫描件、加密、解析失败、超时或过大保留明确原因，不截断后冒充完整正文。文字提取不含 OCR；其能力边界参考 [pypdf 官方说明](https://pypdf.readthedocs.io/en/6.19.0/user/extract-text.html)。

`GET /version` 严格绑定种类、完整资料身份、目标及基准指纹；缺失目标或基准返回 404。差异在 DSA 对已保存正文分行计算，包含上下文、新增、删除和计数；输入上限总计 200,000 字符、4,000 行，输出最多 2,000 行。超限或缺快照明确返回不可比较。版本列表仍最多 20 个不同指纹，按最近观察排序；页面明确显示基准，不把排序推断成连续执行历史。

## 本地测试与门禁

- DSA 六个监测测试文件：39 项通过。覆盖正文与引用变化、原指纹兼容、DOCX、真实 PDF 文字/空文字/加密/页数上限、解析超时、无损升级、旧记录再观察、不可覆盖、失败/租约过期及事务回滚、重开和比较边界。日志：`/tmp/rule-monitor-snapshot-dsa-final.log`。
- DSA `ci_gate.sh syntax`、`ci_gate.sh flake8`、能力边界、runtime 打包合同和数据测试清单门禁通过。新测试已登记；新增运行模块由既有 `src/` 打包目录覆盖。日志：`/tmp/rule-monitor-snapshot-dsa.log`。
- Schema 5 项、API Client 5 项、Market Controller 5 项定向测试通过；包含畸形输入零发送、跨身份或错目标/基准拒绝、错误与统计一致性。日志：`/tmp/rule-monitor-snapshot-contracts.log`。
- Desktop 11 项定向测试通过，保留已有 `act` 警告；覆盖抽屉加载/错误/重试/空记录、增删标记、HTML 作为文本展示、缺失和超限不显示为零变化。日志：`/tmp/rule-monitor-snapshot-desktop-final.log`。
- Schema、API Client、Server 和 Desktop 构建通过；最终 UI 输入已重新构建，保留现有包体提示。组件及合同 ESLint、Prettier、边界与文件尺寸门禁通过，文件尺寸保留 6 项其他文件的存量警告。两个验收脚本被仓库 ESLint 默认忽略，其语法和执行由实际运行验证；不计入 ESLint 覆盖。
- `check-boundaries.mjs` 增加监测合同不能反向引用应用、版本界面不能依赖 Server 的约束；既有 Market 监测不得反向编排 Provider/回测的门禁继续覆盖 Controller。

## 隔离跨进程集成

入口：`pnpm exec node apps/server/scripts/check-rule-monitor-snapshots.mjs`，需要已构建 Server、Schema、API Client 及相邻 DSA `.venv`。

脚本启动独立 Python 进程，在临时目录用受控 HTTP 响应执行真实 `fetch_document` 和 `RuleMonitorRuntime`，依次保存收费比例 0.1% 和 0.2%，重开 SQLite 后提供实际 DSA Control HTTP。另起仅含实际 Market Controller 和 DsaClient 的 Nest HTTP 服务，再由实际 API Client 调用。验证返回两版本、所选正文为 0.2%、差异一行新增和一行删除，删除值为 0.1%。不连接业务 PostgreSQL/Redis，不使用真实凭证；结束后关闭进程和临时目录。

结果：通过。日志：`/tmp/rule-monitor-snapshot-http.log`。该证据证明受控输入下实际跨进程服务链，不代表历史真实收费规则发生过变化。

设置 `SNAPSHOT_QA_BROWSER=1` 后，再由真实 Vite 页面将监测 GET 透传到上述隔离 Nest HTTP（不替换 JSON 内容）。四宽页面均验证实际返回的一增一删和所选完整正文，无业务写入；窄屏差异截图已人工检查。日志：`/tmp/rule-monitor-snapshot-http-browser.log`；截图：`/tmp/rule-monitor-snapshot-http-browser/diff-{1440,1024,768,390}.png`。

## 浏览器验收

入口：`apps/desktop/scripts/check-rule-monitor-snapshots.cjs`，Edge/Playwright，`http://localhost:5173/market-data?section=monitor`。环境参数：

```sh
PLAYWRIGHT_MODULE=/Users/yzin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright
SNAPSHOT_CHROMIUM_EXECUTABLE='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
```

真实状态 GET，受控替换版本和详情 GET；所有非只读请求拦截。1440、1024、768、390 四宽各检查多版本切换、比较基准切换、缺快照、持续 503 后手动重试、单一版本和差异超限，共 20 个场景通过。长正文换行、源 HTML 以纯文本显示，抽屉和页面无横向溢出，Escape、键盘重新打开和关闭按钮均通过。结果：`/tmp/rule-monitor-snapshots-qa/results.json`。

最终 UI 合并列表及正文的刷新状态后，四宽多版本场景重新通过，并通过受控挂起两个 GET 验证：同范围刷新保留内容，只显示一个加载圈，两个请求结束后收起。结果：`/tmp/rule-monitor-snapshots-final-qa/results.json`。两次输入下均无页面异常及业务写入。已人工检查窄屏正文和桌面缺快照截图。

## 目标更新与真实资料

执行目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`；正式入口：`./scripts/update.sh all`，无额外行为开关，采用默认保留数据路径，退出 0。此次有 SQLite 结构变化，使用完整更新而非快更。依赖下载耗时较长，脚本完整结束后才检查功能。日志：`/tmp/rule-monitor-snapshot-update.log`。本轮仅后端运行于 Docker，客户端使用既有 Vite `localhost:5173`；Server 根路径不提供 Desktop 页面。

通过 Server 的既有 `/checks` 接口仅检查 `official-us-rules/us-etf-public-fees`，未改变监测配置。任务 `dccef253-4f70-47ca-92b1-68597b2c9077` 于北京时间 18:27:41 创建、18:28:33 完成，一次领取；检查 7 份资料、0 条内容变化、2 份暂不可读，任务正确收敛为 `partial`。两项失败分别为“FINRA费率规划表：2024-01-01的TAF股数费率与上限”和“SEC Rule31收费日期定义”，均为 `document_unavailable`；未对其重复请求或伪造正文。

截图对应 FINRA FAQ Q100.22 的已有内容指纹仍为 `a164a5ee1aee…`，保持 1 个内容版本；本次采集到 37,260 字符的可读网页正文，快照采集于北京时间 18:28:31，首次观察仍为 11 月 9 日 19:26:36。运行态只读 SQLite 检查确认结构版本为 4，保留 31 个内容版本，新增 6 份可读快照：2 份 HTML、3 份 PDF、1 份资料包 JSON。真实 PDF 提取在目标 Linux 进程限制下取得成功。

结果摘要：`/tmp/rule-monitor-snapshot-live.json`。随后使用 `SNAPSHOT_QA_MODES=live` 直接读取更新后的 Server/DSA，在四宽均验证真实正文、版本选择、抽屉与内容边界、关闭及键盘重新打开；无页面错误和浏览器业务写入。结果：`/tmp/rule-monitor-snapshots-live-qa/results.json`；日志：`/tmp/rule-monitor-snapshot-browser-live.log`。窄屏真实正文截图已人工检查。

真实来源这次没有产生新内容版本，因此未声称真实收费条文发生变化；增删比较正确性由隔离两版本实际 HTTP 链及浏览器证据证明。两份远端暂不可读是保留的来源可用性结果，不是正文比较实现的待办。

## 提交与回滚边界

未执行 Git 提交、推送、规则修改或数据重置。既有工作区修改保留。快照表为新增结构，回退代码不删除资料快照；旧版不支持 `user_version=4`，不能直接用不兼容旧进程打开新监测库，恢复时应使用包含结构兼容性的版本或经备份验证的回滚方案。

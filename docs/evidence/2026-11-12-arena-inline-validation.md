# 竞技场创建就地校验验收

日期：2026-11-12。合同：[竞技场界面规格](../specs/2026-11-12-arena-desktop-experience.md) U09。

## 修改及边界

共享客户端将自主／日频创建校验独立为同步验证入口，保留结构化错误键。模型、标的范围、日期、数值、两级预算及研究观察参数分别投影到字段或分组。服务端 400／422 的结构化 `fields.path` 复用同一投影；不解析异常消息猜测字段，英文校验消息以字段的中文要求展示。

Desktop 复用共享 Field／FieldError，错误与控件关联，提交时定位首个错误；模型数量不足直接在模型选择框下显示“请至少选择两个参赛模型”。Mobile 复用 Field／Feedback，在对应输入或分组显示，并提供输入错误状态及辅助说明。旧日频两端创建入口同步检查。

修改后重新验证；请求反馈与提交时输入快照关联，编辑后的输入不继续显示旧提交的字段错误。服务／网络及响应确认失败保留在保存区域，有限输入和原始精度、可选日期／预算／研究语义保持不变。提交期间继续阻止重复操作。

## 共享检查与构建

- `pnpm --filter @thesis-ledger/api-client exec vitest run test/arena-setup-validation.test.ts test/arena-live-optional-budgets.test.ts test/arena-live-optional-dates.test.ts`：22 项通过，覆盖单模型、多个错误分配、费用精度、日期顺序、固定池、旧日频必填、未发请求及服务端字段投影。
- `pnpm --filter @thesis-ledger/api-client exec vitest run`：48 文件、259 项通过，旧创建／日历及 API 客户端回归保持。
- api-client 构建、Desktop／Mobile 类型检查和 Desktop 生产构建通过。
- Desktop 刷新／日频导航／目录返回三个定向文件共 17 项通过。
- 定向 ESLint、边界、文件尺寸及 `git diff --check` 通过。保留 5 个未修改文件的既有尺寸警告，以及 Node localStorage、React `act` 和 Vite 大包提示。

首次多错误测试为 21 项通过、1 项失败：费用解析错误使协议的跨字段日期检查未执行。补充以共享日期 Schema 验证后的日期顺序投影，使日期和金额错误可以同时归位；最终 22 项定向及 259 项包级检查均通过，实际提交仍须通过完整协议校验。

## 实际浏览器

维护脚本均使用真实业务组件和受控 API，覆盖 1440、1024、768、390：

- Desktop：单模型错误位于模型组，保存摘要无重复错误；首错获得焦点。日期顺序、费用精度及研究步骤分别就地显示，错误说明与输入关联。修改后错误清除，校验失败无 POST。受控 500 在保存区显示，受控 400 字段错误归位研究步骤；编辑后不显示旧错误，修正和重试保存成功。旧日频名称／日期／模型／范围错误各自归位。
- Mobile：单模型、单次输出错误分别就地显示；选择第二个模型及清空修正后恢复保存。旧日频名称及模型提示、图表触摸、图例、指标及详情回归通过。
- 两端零页面错误、无横向溢出。Desktop 最终提交防重保护后重验四宽度通过。Mobile 为 RN Web 夹具，未声称原生宿主验收；完整应用及原生层由父任务继续持有。

命令分别为：

`PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright ARENA_OPTIONAL_BUDGETS=1 ARENA_OPTIONAL_REQUEST_LIMITS=1 ARENA_INLINE_VALIDATION=1 ARENA_QA_OUTPUT=/tmp/arena-inline-validation-desktop node scripts/local-runtime/arena-optional-dates-browser.mjs`

`PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright ARENA_MOBILE_OPEN_SEASON=1 ARENA_MOBILE_UNLIMITED_BUDGET=1 ARENA_OPTIONAL_REQUEST_LIMITS=1 ARENA_INLINE_VALIDATION=1 ARENA_QA_OUTPUT=/tmp/arena-inline-validation-mobile node scripts/local-runtime/arena-live-mobile-browser.mjs`

截图位于以上临时目录，已查看窄屏模型错误局部。真实业务数据没有写入，没有真实模型或来源调用；本轮仅客户端及展示修改，没有 Docker／数据库变更。

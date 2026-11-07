# 浏览器请求标识兼容验收

对应 [Spec](../specs/2026-11-07-browser-request-id.md) 与 [Task](../tasks/2026-11-07-browser-request-id.md)。共享工作区原有变更全部保留，未提交 Git。

## 原因与修复边界

`StrategyRiskApplicationPage` 在 useState 初始化时直接调用 `crypto.randomUUID()`，缺少此 API 时尚未请求就发生渲染异常。26 个 Desktop 消费文件已统一使用 `src/lib/client-request-id.ts`。原生方法存在时沿用；缺失时使用 getRandomValues 生成符合版本位与变体位约束的 UUID v4；缺少安全随机能力时明确失败。幂等键创建、重试和重置的时机不变。账户及组合中原有时间戳/Math.random 降级已移除，AI 提供方取消请求标识也使用同一实现。

浏览器原语归 Desktop lib，不提升为跨运行时包。Mobile 已使用 expo-crypto，保留原生实现。边界检查阻止 Desktop 消费层重新直接调用 crypto.randomUUID。

工具选型已读取已安装 es-toolkit 1.51.0 的导出、声明与实现。random 使用 Math.random，compat/uniqueId 使用模块内计数器，没有满足 UUID 需求的函数，选用原生 WebCrypto，不增加依赖。官方资料：[random](https://es-toolkit.dev/reference/math/random.html)、[uniqueId](https://es-toolkit.dev/compat/reference/util/uniqueId.html)、[randomUUID](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID)、[getRandomValues](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues)。截图本身不能证明用户访问协议；验收独立确认了 HTTP 能力路径。

## 验证结果

- 定向：`NODE_OPTIONS=--no-experimental-webstorage pnpm --filter @thesis-ledger/desktop exec vitest run test/client-request-id.test.ts test/market-experiment-recovery.ui.test.tsx`，2 文件、12 测试通过。日志 `/tmp/browser-uuid-focused.log`。
- Desktop 包：236 文件、1343 测试通过，日志 `/tmp/browser-uuid-target.log`。首次命令给 test 脚本多传了 `--`，实际执行全包；之后另行运行上述定向命令确认范围。没有重复全包运行。
- `pnpm --filter @thesis-ledger/desktop build` 通过，日志 `/tmp/browser-uuid-build.log`。仍有既有大 chunk 提示。
- 新原语、相关单测、风险恢复测试及浏览器 harness 的 ESLint 通过。日志 `/tmp/browser-uuid-focused-lint.log`。
- `scripts/check-boundaries.mjs`、`scripts/check-workspace-dependencies.mjs` 通过；文件尺寸检查有 6 个既有大文件警告，未提供 baseline，因此不能据此宣称全仓 ratchet 基线已验证。本轮消费者只替换调用并增加 import，同时移除一个原有空行，不增加原有文件行数。
- 扩大到相关 feature 目录的 ESLint 未全部通过：`NewResearchSheet.test.tsx:136` 的 require-await、`OptimizationPricePreparation.tsx:44` 的内联 import 类型。这两处是共享工作区既有修改，本次未改动对应表达式；未扩大为全仓通过结论。日志 `/tmp/browser-uuid-lint.log`。
- `git diff --check` 通过。

## 浏览器受控验收

入口 `apps/desktop/test/browser-request-id.html` 使用实际风险页面、路由、TanStack Query 和 API 客户端；浏览器运行器 `/tmp/browser-uuid.cjs` 拦截全部 API。HTTP 地址 `http://browser-uuid.test:5173` 的静态资源通过 Playwright 转发到本地 Vite，不改宿主 DNS 或安全上下文设置。Chromium 实测 `isSecureContext=false`、`typeof crypto.randomUUID=undefined`、`typeof crypto.getRandomValues=function`。

风险预览成功；两次受控失败保存产生相同的合法 UUID v4；放弃并关闭返回来源。1440、1024、768、390 宽度均无横向溢出，抽屉在视口内，页面异常 0。结果 `/tmp/browser-uuid-results.json`，截图 `/tmp/browser-uuid-{1440,1024,768,390}.png`。已目视检查窄屏截图。

首次浏览器样本缺少账户必填 institution，校正为 null 后继续；失败提示与关闭按钮断言也已匹配实际 UI，未为验收更改业务代码。只验证受控保存失败及重试，没有向真实账户创建风险规则、修改凭证或调用外部行情。

当前 Vite 读取更新源码，前端 dist 已构建。本轮未修改 Server、数据库、原生工程或 Docker，也未声称更新生产镜像。

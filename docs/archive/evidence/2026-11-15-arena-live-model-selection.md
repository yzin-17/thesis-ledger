# 竞技场自主研究模型筛选修复验收

## 修复范围

创建页共享选择器 `arenaLiveModels` 原先把自主研究合同版本写死为 V2，导致服务端已支持、已验证的 Cloudflare V4 被排除。现仅限定自主研究用途，合同兼容性消费服务端 `readiness` 结果；保留停用、用途、验证、费用价格及其他阻断条件的原有筛选行为。Desktop 与 Mobile 共用此选择器。

服务端 `apps/server/src/ai/ai-provider-readiness.ts` 已检查合同版本和适配器支持，不支持的合同带有 `adapter_contract_evidence_missing` 原因，不能进入仅待费用授权的候选分支。

## 自动验证

- `pnpm --filter @thesis-ledger/api-client test`：51 个文件、276 项测试通过，其中新增 5 项模型筛选回归测试。
- `pnpm --filter @thesis-ledger/api-client build`：通过。
- 对修改的选择器和测试执行定向 ESLint：通过。
- 定向 `git diff --check`：通过。

测试覆盖 Cloudflare V4 可选与去重、服务端不支持的历史版本不可选、停用、其他用途、未验证或验证失败、其他阻断原因、价格不完整，以及零价格和就绪路线的原有行为。

## 实际页面

2026-11-15 在本机 `http://127.0.0.1:5173/arena/new` 使用真实服务只读验证。当前服务返回 Cloudflare V4 验证通过、仅待任务费用授权；工作区客户端合同已并发推进到 V5。修复后无需修改 Cloudflare 配置，V4 模型仍正常出现在候选列表中。

1440、1024、768、390 四种宽度均能搜索、选择和移除 `@cf/google/gemma-4-26b-a4b-it · cloudflare`，无页面横向溢出。已查看桌面和窄屏截图，选中标签与搜索控件正常显示。

截图保存在 `/tmp/arena-cloudflare-v4-{1440,1024,768,390}.png`；验证脚本保存在 `/tmp/arena-live-models-browser.cjs`。验证时拦截全部非 GET 业务请求，实际未触发写请求，未保存或启动比赛，未发起模型调用。

本次未部署 Docker、未验证原生客户端运行态；共享选择器的编译和测试不能替代这些运行态验收。

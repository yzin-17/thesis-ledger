# Investment OS

Investment OS 是一个本地优先的个人投资研究与风险管理系统。它统一管理账户、Ledger、持仓投影、行情、风险、策略回测、交易复盘和 AI 研究来源；系统只做分析与提醒，不连接券商下单。

## 架构

- `apps/server`：NestJS API，拥有用户事实和业务编排。
- `apps/desktop`：React 桌面 Web 界面，只访问 Investment OS API。
- `apps/mobile`：React Native 客户端边界，目前为只读能力入口。
- `packages/domain`：无基础设施依赖的确定性计算。
- `packages/schemas`：跨模块版本化契约。
- `services/dsa-adapter`：可替换行情 Provider、路由、健康和凭证工具。
- PostgreSQL 保存事实；Redis 只保存缓存、锁和可重建状态。

## 快速开始

要求 Node.js 22、pnpm 10 和 Docker Desktop。

```bash
cp .env.example .env
pnpm install --frozen-lockfile
docker compose up --build
```

服务启动后访问：

- API 健康检查：`http://localhost:3000/api/v1/health`
- Desktop 开发环境：执行 `pnpm --filter @investment-os/desktop dev`

常用质量命令：

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 数据与安全边界

- Ledger 是交易与现金事实源；Position 是可重建投影；Snapshot 是历史缓存。
- DSA 和其他 Provider 只提供可替换能力，不拥有账户或 Ledger。
- AI 只能读取经过权限控制的 Tool，不能写 Ledger 或生成执行订单。
- 行情、指标、筹码和 AI 结论都必须携带来源与数据时点。
- `.env`、API Key、Webhook 和 Provider Credential 不得提交仓库。

## 当前限制

- 免费数据源可能延迟、缺失或限流；界面会显示 stale/partial，而不会伪装为最新完整数据。
- 正式 DSA fork、真实飞书 Webhook、专业 Provider 和跨平台签名需要仓库所有者提供外部资源。
- 所有收益、风险、回测和 AI 输出仅供研究，不构成投资建议。

更详细的运行和模块说明见 [`docs/operations.md`](docs/operations.md) 与 [`docs/user-guide.md`](docs/user-guide.md)。

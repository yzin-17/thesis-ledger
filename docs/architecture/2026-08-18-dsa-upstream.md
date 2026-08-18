# DSA Fork 与上游同步

## 仓库边界

主仓与 DSA 现在位于同级目录：

```text
thesis-ledger-workspace/
├── thesis-ledger/
├── daily-stock-analysis/
└── thesis-ledger-infra/
```

`daily-stock-analysis` 是独立 Git 仓库，不再位于主仓 `third_party/` 下，也不通过主仓 `.gitignore` 形成隐式依赖。主仓只保留 DSA client、Schema、Stub 和 Contract Test；DSA 原生 API 继续由 Fork 自己维护。

## 远程与审计基线

- 上游：`https://github.com/ZhuLinsen/daily_stock_analysis.git`
- 自有 Fork：`https://github.com/yzin-17/daily_stock_analysis`
- 当前共同基线：`831ada5370123551e5cb4fc099208dd70e892e22`
- 上游版本基线：`v3.28.0`

同步时在 DSA 仓库内执行：

```bash
git fetch upstream --tags --prune
git status --short --branch
git merge --no-commit --no-ff upstream/main
```

正式合并前必须保留临时同步分支，并运行 DSA 原有测试、ThesisLedger Contract Test 和固定行情/筹码回归。禁止直接覆盖无法解释的行为变化。

## ThesisLedger Contract V1

DSA Fork 新增以下兼容层：

```text
GET /api/v1/thesis-ledger/capabilities
GET /api/v1/thesis-ledger/market/quote
GET /api/v1/thesis-ledger/market/bars
GET /api/v1/thesis-ledger/market/indicators/{name}
GET /api/v1/thesis-ledger/market/chip
```

接口使用 `THESIS_LEDGER_DSA_TOKEN` Bearer Token，不复用 DSA 管理员 session。Contract V1 只声明日线 `1d` bars、MA/MACD/RSI 和筹码摘要；分钟线、ATR 和完整筹码分布通过 capability 与结构化错误表达。缺失的 `buckets` 或 `mainPeak` 不得由适配层猜测。

确定性集成使用 `THESIS_LEDGER_FIXTURE_MODE=true`；在线 Provider smoke test 只作为定时或手工非阻断检查。

## 镜像版本策略

DSA Fork 的版本格式为上游版本加 Fork 修订号，例如：

```text
v3.28.0-thesisledger.1
```

每个发布镜像必须同时记录：DSA Fork commit、上游 commit、Contract major version 和 GHCR digest。生产环境只使用 digest；tag 仅用于发布说明和兼容矩阵。发布前需确认 DSA 的 Docker workflow 已接受该 prerelease 版本格式。

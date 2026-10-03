# I01 合成 JSONB 驱动往返单次诊断

## 结论与状态

任务：`I01-jsonb-driver-diagnostic-0928`。状态：`needs_split`，根因仍未知。

本轮固定的 15 条合成 Bar 完整 V3 响应，经内存 JSON 往返、实际项目 Prisma 驱动的原生 JSONB 回读、同一 JSONB 值转为文本后由 Node `JSON.parse` 回读，完整摘要一致；字段、类型及数值 IEEE-754 位模式差异均为零。这只证明此次输入与当前运行版本上的驱动往返没有差异，不能概括排除所有 JSONB 数字问题，也不能代表原 Worker 完整窗口通过。未取得原失败字段差异，不能据此选定摘要、精度或兼容策略修复叶。

原门禁未重跑，首次加两次重试预算未重置；`I01-reader-pg` 与 I01 父项继续开放。未放宽价格、覆盖证明、输入完整性或篡改失败约束。

## 输入、接缝与授权范围

前置只读证据：`2026-09-28-i01-jsonb-hash-discovery.md` 与 `2026-09-27-worker-runtime-integration.md`。本轮唯一仓库写入为新测试 `apps/server/test/market/market-window-jsonb-roundtrip-diagnostic.test.ts` 和本文件；现有源码、fixture、配置、任务台账及其他 WIP 保留。

测试读取已有 Schema fixture，沿 `v3-snapshot-fixtures.ts` 的计算表达式生成 15 条合成 Bar：`close = 1 + index / 1000`，OHLC 采用既有加减表达式，volume/amount 采用既有算术。日期为该 fixture 起始日起连续 15 个工作日，coverage 与 calendar/window 同步对应。来源、单位及价格语义保留既有 fixture 定义；本轮没有读取真实行情或业务数据。完整响应两端均使用严格 Schema 和现有 `marketFrozenWindowHashV3`，未调用 Reader、Controller、Queue、Worker、Provider 或真实 AI。

默认执行仅运行内存测试；PostgreSQL 用例必须显式提供 `DIAG_DATABASE_URL` 和 `DIAG_DATABASE_NAME`，只接受本轮命名格式的 loopback、非默认端口、无密码隔离地址，拒绝目标数据库或默认配置。没有使用 `loadConfig` 或默认 `DATABASE_URL`。

实际 `PrismaService` 继承项目默认 `PrismaClient`，没有自定义 JSON adapter。本诊断使用相同客户端包和默认驱动构造方式，显式传入隔离 datasource；不调用其业务结构检查生命周期。连接后先用只读 SELECT 核实实际 database、current user 与 owner 均等于隔离实例名，再执行一次诊断 SELECT：

```sql
WITH value AS (SELECT $1::jsonb AS payload)
SELECT payload AS native, payload::text AS text FROM value
```

参数为严格解析后的完整合成响应 `JSON.stringify`。SQL 中两个返回值来自同一个 JSONB 值；文本由 Node `JSON.parse` 解析。没有业务表、public schema 写入、迁移或业务结构重建。本轮没有验证 Prisma ORM 的 JSON 字段写入路径，也没有复原原失败完整窗口或当时运行产物。

## 脱敏比较结果

原始、内存回读、原生 JSONB 回读、文本回读的完整摘要均为：

`b0f9b02c3027548362810a17e178801dd38966ba5d2fb62da51da8e4235d1115`

| 比较 | 数值位模式差异数 | 其他字段差异数 | 差异字段路径 |
| --- | --- | --- | --- |
| 原响应 → 内存严格解析结果 | 0 | 0 | 空 |
| 原响应 → 原生 JSONB 原始结果 | 0 | 0 | 空 |
| 原响应 → 原生 JSONB 严格解析结果 | 0 | 0 | 空 |
| 原响应 → 文本 JSON.parse 原始结果 | 0 | 0 | 空 |
| 原响应 → 文本严格解析结果 | 0 | 0 | 空 |
| 原生 JSONB → 文本 JSON.parse | 0 | 0 | 空 |

比较按字段存在性、类型、数组长度与叶值递归执行，数值用 `Object.is` 和 big-endian IEEE-754 十六进制位模式比较。对象键重排不构成字段变化，完整摘要仍由现有严格 Schema 后的算法独立计算。因为没有差异，本次位模式差异路径为空。日志仅保留摘要、比较计数/差异路径/类型/位模式、版本及资源清理信息，没有完整 JSON、原始数字、业务原文或凭据。

## 实际运行版本与输入指纹

- Node：`v24.18.0`。
- Prisma client：`6.19.3`；默认 runtime：`@prisma/client/runtime/library.js`；engine：`c2990dca591cba766e3b7ef5d9e8a84796e47ab7`。
- Zod：`4.4.3`；Vitest：`3.2.7`。
- PostgreSQL：`17.11 (Debian 17.11-1.pgdg13+2)`。
- 使用已存在本地 `postgres:17` 镜像 `67f41722b7a8`，`--pull=never`；没有拉取依赖、镜像或重建运行产物。
- Schema 包实际 exports 为 `packages/schemas/dist/index.js`；下面记录实际加载 Schema 产物与相关输入的 SHA-256，不能把当前指纹视为历史失败版本的指纹。

| 文件 | SHA-256 |
| --- | --- |
| 新诊断测试 | `d389552cccc260bde9c8eb8f9a0c4413426a57dccb30c5eb664e3cad099d3b2c` |
| `apps/server/src/market/market-frozen-window-v3.ts` | `00376013fed2f2613257dae6b6c1b5489a84e661084c957972cc84ef62b78c57` |
| `apps/server/src/market/market-window-evidence-v3.repository.ts` | `7a31e0019caa1172f7e90e67d9046533f70d90bb6be82d349000e144104688db` |
| `apps/server/src/platform/prisma.service.ts` | `1172a9b16a7ec7b92671b5784369e2f1c4092fd2a03bd026918a524011261b3a` |
| `packages/schemas/fixtures/market-data-v3.response.etf-qfq.json` | `cdeebf36e29b02042805cbe3a6076eb2e60d2df03f4aa366d3978591af7cf9ff` |
| `packages/schemas/dist/market-data-wire-v3.js` | `31a9045e5e7054a614a9d9f6edfbba7b243df2bb155ab61393c1c2b9e0c3b5ba` |
| `packages/schemas/dist/market-bar-series-v2.js` | `27a351e0a589ef2ca61f1c02996c2eb9187c3ef8bbecbc56ea85a0ad143d3c3c` |
| `packages/schemas/dist/market-coverage-proof-v3.js` | `602a3e67b34cf265678cd811ab035649142289c9cf6eb9e400bfb0b915ac1fd7` |
| `packages/schemas/dist/market-price-protocol.js` | `07e16887f6293f197e4184ec1b67461d4a1b850294536ec82395f9120efe52c7` |

## 单次预算与验证

1. `rtk proxy pnpm --filter @thesis-ledger/server exec vitest run test/market/market-window-jsonb-roundtrip-diagnostic.test.ts`：默认环境 1 项内存测试通过、1 项 PostgreSQL 诊断明确跳过。
2. `rtk proxy python3 /private/tmp/i01-jsonb-driver-0928-launcher.py`：显式隔离环境中 2 项执行完成；其中内存断言通过，PostgreSQL 用例仅完成诊断采集，没有把摘要相等断言当作业务验收。诊断调用 1 次、重试 0 次。
3. 新测试 `prettier` 格式化和定向 `eslint --max-warnings=0` 通过；最终两份新文件格式检查通过。未运行 Server typecheck、build、全量测试或仓库门禁，后续统一最终门禁另行负责。

## 隔离资源与清理证据

只读 Docker 库存确认 PostgreSQL 17 镜像已经存在后，新建唯一容器/数据库/owner `i01_jsonb_diag_0928_e142bb42`，绑定 `127.0.0.1:60298`，仅新实例使用临时 trust；存储为 `/var/lib/postgresql/data` tmpfs，无 volume。容器 label：`task=I01-jsonb-driver-diagnostic-0928`、`isolation=i01_jsonb_diag_0928_e142bb42`。

精确容器 ID：`3df97044b6a7c744541998c2e20620a2706bacc47c9060ece865726c0cd65ced`。诊断 finally 已断开 Prisma；launcher 仅对该 exact ID 执行 `docker rm --force`，返回码 0，随后 exact ID 查询为空（`exact_container_absent=true`）。没有删除 volume、修改 compose、调用 infra 更新或处理旧资源。

本轮临时文件：`/private/tmp/i01-jsonb-driver-0928-launcher.py`、`/private/tmp/i01-jsonb-driver-0928-e142bb42.log`、`/private/tmp/i01-jsonb-driver-0928-e142bb42.json`。脱敏结果和清理 manifest 保留用于审阅；launcher 未留后台进程。

## 后续边界

本轮不提出源码修复叶，不扩大合成向量，也不执行第二次 PostgreSQL 诊断。阻塞项是缺少原失败完整窗口的精确字段差异及其实际 ORM 写入/回读接缝证据。若父任务后续授予新的独立调查，应先明确固定输入、实际持久化路径和新预算，再采集精确身份的字段/位模式差异；该建议本身不授予重跑原 Worker 门禁或修改摘要合同的权限。

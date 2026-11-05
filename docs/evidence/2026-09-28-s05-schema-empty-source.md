# S05 零字节日历源码结构修复证据

## 范围与结论

固定日历包包含两份合法零字节源码：`exchange_calendars/pandas_extensions/__init__.py` 与 `exchange_calendars/utils/__init__.py`。共享的 `rawText.min(1)` 曾使它们在 `calendarArtifacts.files[].rawBase64` 处被结构校验拒绝。

源码附件的 base64 字符串现在允许空值，继续保留原有长度上限和编码正则。`originalEvidence.raw.bytes` 仍使用非空 `rawText`。文件路径、摘要格式、文件数组、发布引用、树摘要字段及类型形状均保持原约束。结构接受不授予历史真实性；实际字节摘要和固定树认证仍由 parser 完成。

## 回归与检查

- `rtk proxy pnpm --filter @thesis-ledger/schemas exec vitest run test/market-pit-historical-evidence-v1.test.ts test/market-pit-reconstruction-v3.test.ts --cache=false`：2 文件、66 测试通过（27 历史证据 + 39 reconstruction）。
- 新增回归采用空字节 SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`，验证两份空源码结构接受，并拒绝缺少 `rawBase64`、缺少 `sha256`、空文件数组及 utf8/base64 两种空原始证据。
- `rtk proxy pnpm --filter @thesis-ledger/schemas typecheck`：通过，未输出构建产物。
- 两个源码文件的 `prettier --check` 与 `git diff --check`：通过。
- 首次测试调用通过包脚本转发 `--`，意外运行了包内全部测试；新增测试的发布记录类型不匹配导致 1 项失败，其余 432 项通过。补齐合法 `calendar-package-release` 发布 fixture 后，以上直接执行的两文件定向检查通过。首次全包结果不计为全包通过。

## 稳定输入与集成交接

源文件 SHA-256：

- `packages/schemas/src/market-pit-historical-evidence-v1.ts`：`1c941c3d872d52f12775ce32b039d64e6c1ed6ac302f47674aa389367ba38eb2`
- `packages/schemas/test/market-pit-historical-evidence-v1.test.ts`：`0e663e71666ec27cb29652fc6c0fa08967ed63c39df77bb0e6a512acb8855832`

仅修改上述源码、测试及本证据文件；未修改 exports、reconstruction、Spec/Task 或其他协作者文件。未执行 Schemas build；`dist` 刷新由父任务在 Server 当前测试完成后统一处理。未执行网络、Provider、数据库或部署验收。

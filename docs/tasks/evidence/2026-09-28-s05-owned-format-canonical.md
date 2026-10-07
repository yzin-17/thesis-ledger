# S05 指定文件格式归一证据

## 状态与范围

- 任务：`S05-owned-format-canonical-0928`；状态：`worker_done`，待父级最终验收。
- 仅修改下表十个文件的 Prettier 布局及本证据；保留已有 dirty WIP，未 stage、commit、reset、clean，未改逻辑、字面量、断言、字段、阈值或 ignore。
- 全部源码写入通过原生 `apply_patch`；Prettier API 只生成内存候选，未使用 `--write`。

## 方法与命令

- 候选生成及语义检查：`rtk proxy node /private/tmp/s05-canonical.cjs`，退出码 0，10/10 通过。
- 工具：Prettier `3.9.6`、TypeScript `5.9.2`、ESLint `9.39.5`、Node.js `v24.18.0`。候选使用项目 `.prettierrc.json`。
- `TypeScript.transpileModule` 参数：`target: ES2022`、`module: ESNext`、`removeComments: true`；两侧输出再使用完全相同 Prettier 参数归一：`{"parser":"babel","singleQuote":true,"trailingComma":"all","semi":true,"printWidth":100}`。归一 JS 字节和 SHA-256 一致，import 顺序没有重排。
- AST 使用 `TypeScript.createSourceFile` 及 `forEachChild` 递归，比较 SyntaxKind、全部标识符与 literal.text、操作符节点、directive 所在语句和有序子节点。忽略位置、trivia、parent；SourceFile.text 是整份源码容器，排除该表示字段，未忽略任何 literal.text。另用 TypeScript printer `removeComments:true` 打印两侧源码后经相同 Prettier 设置（parser 为 typescript）归一，字节一致。
- 初次诊断发现 SourceFile.text 原文包含格式差异；修正仅位于临时比较器，不涉及源码。没有通过删除语句或调整字面量获得一致性。
- 后验检查：`rtk proxy node /private/tmp/s05-check.cjs`，退出码 0；10/10 实际写入字节与已验证候选完全相同，Prettier check 全通过。
- 普通 ESLint 使用仓库实际配置，仅 `lintFiles` 下表十路径；0 errors、0 warnings。strict 同范围加 `complexity: [error,20]`、`max-lines-per-function: [error,{max:220,skipBlankLines:true,skipComments:true}]`；0 errors、0 warnings，相当于 `--max-warnings 0` 的零警告门禁。未使用 fix。
- `git diff --check -- <十个 owned 路径>`，经 `rtk proxy node` 调用，退出码 0。格式补丁由对应 before/candidate 的 unified diff 生成；写后逐文件精确比较。

## 源码输入摘要

| 文件 | 修改前 SHA-256 | 修改后 SHA-256 |
| --- | --- | --- |
| `apps/server/src/backtest/backtest-reconstruction-preflight-v3.ts` | `b67b7e3975cf17a62322865159d45d8d9c1a46a369a2ab78a049bd193d3640ed` | `8374356a08e55afa7c81727533a588b36524aa7ad00daaa8c4efb4e49f090115` |
| `apps/server/src/backtest/backtest-snapshot-v3-calendar-alignment.ts` | `4f9a10022d837ccff46160bea9bb858316d7cb1c484fc16f7d9f07c0ecd50864` | `e5548e60f4a875822be7142b0dad05b671c083af6eb50ae2da0c2e50888b1e56` |
| `apps/server/src/backtest/backtest-snapshot-v3-dependency-collector.ts` | `8817abea7cddea732854c384472a9653ad1163725757559c8bbb1e2568a38364` | `81772abe7e7ae7c6abf6105780a2e1297e0e8b2bda1ade77566596d39563fb2c` |
| `apps/server/src/backtest/backtest-snapshot-v3-dependency-error.ts` | `85410b83d5531a94777eb13d2b0aeaeb696f65271693e0d7f070324e4b765b21` | `d6cedf2a3afaeb3f2bc0ece0d8d86e4f356c6d090017f3521857068c89b52b18` |
| `apps/server/src/backtest/backtest-snapshot-v3-events.ts` | `f095727ca53892cf444e22aedd71ad14f4f69dce9db6c959e49150bc8bff5194` | `39df7861eb5889a0003e75b512cabf96402ad8d02dda9266938c3c0771f9ef9a` |
| `apps/server/src/backtest/backtest-snapshot-v3-multi-window.ts` | `d2fe0c82c560453a2da794b9d2da93bedfca658754a01e3e7cf7666de9661bbb` | `602035e6cc100a488cb351b1f655b04cb60f6d40a75c4d156d059bd6980d6dc7` |
| `apps/server/src/market/market-pit-reconstruction.repository.ts` | `f02186f0f8da7b1cd6d7c991cd362a0d0e8e0819c1cbea71614348e7dc37948f` | `afaed2831520bcbb3c144b6f171641c7a9c9e3d5f0989f2325dfe7a088a33187` |
| `apps/server/test/backtest/backtest-reconstruction-preflight-v3.test.ts` | `d543161362b73f2541e77c1be4fc06567fbc10d47a4b6d12dd0d22c171213017` | `1b0f4996362c886f3b66484d210276e4955c5d0c4aaa54796c8a1ef30d1d8052` |
| `apps/server/test/backtest/v3-snapshot-builder.test.ts` | `98acfbf4947b91e346bff3acb694b9024b3d3951717c52b44ce6df90cd4963d3` | `8bf6c83c5929dff976d77928a7900c8b2d24f92863deea0d9ad2ca033610689e` |
| `apps/server/test/market/market-pit-reconstruction.repository.test.ts` | `815fe692236057683db1bb453e612d2709a8651322d2df84299fa2615ec51ac9` | `a76ec49e605f76be02599101fce34d1375c350cfa53365b7508cd0c2e082a8ed` |

## 语义摘要

下表两侧摘要均相同；三个检查互相独立，摘要未截断。

| 文件 | AST SHA-256 | 归一 JS SHA-256 | 归一 printer SHA-256 |
| --- | --- | --- | --- |
| `apps/server/src/backtest/backtest-reconstruction-preflight-v3.ts` | `fd710fce3a0b5f40eec0fd9a7dc619f053fc482b0e34043040e7355b062a280b` | `cb7d43e6a9b4689666d28710e4d60b99e26bda8c21bdc0269cff6b435f42220e` | `16e0f63b8d4c3060b6a1cfae7a09f39e0bd76da6a3bc0ba0e0622f674292af21` |
| `apps/server/src/backtest/backtest-snapshot-v3-calendar-alignment.ts` | `123bc703ec873fa02784fcfc3e91d04de493106b054285e3cfc2f8df4ee8fe6b` | `4e740c4b7bca0fe5aae95ce651aed51c817e594cdeb013b7ab71995fb71a1ff7` | `8bddc935c74522144278f3a0c13cea5ea984e2c6418c22e6219faa32444b5f85` |
| `apps/server/src/backtest/backtest-snapshot-v3-dependency-collector.ts` | `6dc5d1405311e24df41a388c25a76b6ecfc7786073d5916053c66ef847aef2ed` | `c9a61777b93e1a889ee60c05caf89cc4a75d2c613edde3414c7a94dfef31440f` | `98385aa13915224cc7a5a586d8bb2bd520db5bf156fc9d3c888dbe7994fe3f53` |
| `apps/server/src/backtest/backtest-snapshot-v3-dependency-error.ts` | `8c640871714e65a3c0c09414f464ba147b7cb3ea7d20c824307bc2fea99f33cd` | `8b6d34b12dd707bfaf433ce467a027c68af42a79f4ea86d365efe8b89d64f08a` | `c7def2515f0653bac4e09c29aae125585c3bc544f14aca862fdd73489295755a` |
| `apps/server/src/backtest/backtest-snapshot-v3-events.ts` | `0c87a6b791823f7dbfb860655c95b230fa65f5128f6a0e1eb803bd7420a45189` | `4c53b2bab64d2b2a9ec2420baa74d04e5c72bed3c4e5f94979a5bb5e6c59fda3` | `5a43a1b8423fa9ffa37c3e5285c9546127f117f51695bd85269e0854b3378dc6` |
| `apps/server/src/backtest/backtest-snapshot-v3-multi-window.ts` | `acc6ef03e176ea78df4f9cc89703e6270e9bc03c2ed55dba5efbb466537ec71a` | `8e2316f3f0f2ec63fa4689a681386032b7e515bdceea730673d3f619d1213066` | `f9ec06fdfc0b537c0dd61958be26f89d703fcfdc118ce4dff955d1bae07fce63` |
| `apps/server/src/market/market-pit-reconstruction.repository.ts` | `8d248380fbb308f4627efa4314ac96da2872052e7020dbab96526beda4b83764` | `ae7ce01ea7179857757ee6a66cee8213aecb72329e0d6a2626fa1b0fd225f626` | `da127b23a221fe4c773d7508dfb42f781511e022e7fb320232d0f3884e25d4bf` |
| `apps/server/test/backtest/backtest-reconstruction-preflight-v3.test.ts` | `843bcb7bb79c00b3d6712eb674ee2ac0126d118cd7be82f871d92793417652c2` | `52858564dd3375c4c1eeb5616b7e235faef4ef5ddac27a2c9e70ff6f0238a369` | `710b675780bcfff0494b1e162736c133f9d2854699f06a51d1b157a4aee97fca` |
| `apps/server/test/backtest/v3-snapshot-builder.test.ts` | `a635468b8f2bcd1319e8bdf3f9016d58be7af5249aa92df4ce02ecab0ae2e75f` | `efe3f9c3d589b50208b3c4f04775fbc414f5384505cd3e9ca7af13f04917b69a` | `503f0e314528212869a55886d352343f6a3544ae8abf7f25ff80eb7ff07c5bc3` |
| `apps/server/test/market/market-pit-reconstruction.repository.test.ts` | `3aa9fbe986b0de44ba83b7fd3e183d83a74eb8ef72d38535ff0f3d713f2cb865` | `8e0d94600b28d538776b85c692fc112f7ffe11301eb7c302b5a89e6a42659ae1` | `93737fc05c25db1b0efbcb17caf75de0e69363f1656578b8a8466ba649f99c6f` |

## 验证边界与进程交接

未运行 test、typecheck、build、数据库、网络、Provider 或部署。上述证据仅证明指定格式变更及静态门禁，不构成业务或运行时验收。所有前台命令均已结束，未启动后台进程；本叶没有遗留进程。检查输入为上表修改后摘要，源文件或相关格式与 ESLint 配置变化将使证据失效。

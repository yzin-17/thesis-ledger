# 第三方依赖许可证治理

完整 npm 依赖许可证清单是可重建产物，不作为 `docs/engineering/` 的人工维护正文长期提交。当前依赖清单通过：

```bash
pnpm licenses:scan
```

从锁定依赖的 package metadata 生成。

## 维护原则

- Engineering 文档只维护“怎么生成、怎么审、发布时放哪里”的规则；
- 完整机器生成清单优先作为 CI/release artifact，或更新仓库根的 `THIRD_PARTY_LICENSES.md` / 发布包 notice；
- 依赖升级后重新生成并比较新增/变化许可证，不手工维护 100KB 以上的包列表；
- `UNKNOWN`、自定义 license、双许可证、copyleft 或缺失 metadata 必须人工核对，不能仅依赖扫描器结论；
- DSA Fork、移植代码、字体/图片/图表库资源、非 npm 二进制和其他第三方材料需要单独纳入人工复核；
- 发布证据应记录锁文件 revision、扫描命令和最终 notice/artifact，而不是复制整个生成结果到 Review。

## 发布检查

发布前至少确认：

1. `pnpm licenses:scan` 可在当前锁文件上成功运行；
2. 新增依赖不存在未解释的许可证风险；
3. `THIRD_PARTY_LICENSES.md` 或发布 artifact 与当前依赖基线一致；
4. DSA Fork 与非 npm 依赖已完成人工补充核对；
5. 第三方 attribution（例如图表库）在产品或 notice 中按其许可证要求保留。

历史 154KB 自动生成 inventory 已从 Engineering 正文移除；如需追溯，使用 Git 历史即可重新查看，当前仓库不再维护第二份完整清单。

# AGENTS.md

本文件是给模型的工作准则，与 [PROCESS.md](./PROCESS.md) 同时生效；两者冲突时以更严格的一条为准。

## 必须

- 开工前读 `PROCESS.md` 与 `docs/gates.md`，确认改动类型。
- 只在允许前缀的分支上工作，一个 PR 只做一件事。
- 提交前本地运行 `node scripts/ci-gate.mjs`，全绿才 push。
- 改行为就改测试；改用户可见内容就同步中英文两份文档与 CHANGELOG。
- CI 失败时读每行的 `fix:` 提示修根因；修不动就在 PR 里写清尝试过的方案并交给人。

## 禁止

- 手改 `scripts/ci-gate.mjs`（只能从 canonical 仓库同步）。
- 新增 `.only`、`.skip`、`@ts-ignore`、`eslint-disable` 等跳过或压制。
- 自己给 PR 添加 `ci-change` 或 `human-approved` 标签。
- 在本机执行 `npm publish`，或对 main 强推。
- 删除、改写 PR 模板里的必勾项。

## 常用命令

```bash
node scripts/ci-gate.mjs
node scripts/ci-gate.mjs --only=manifest
node scripts/ci-gate.mjs --json
```

## 交付标准

1. verify 全绿，且 PR 模板每一项都已勾选。
2. 双语文档标题一一对应，代码块命令完全一致。
3. CHANGELOG 有本次版本小节，写明改了什么、对使用者有什么影响。

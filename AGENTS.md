# AGENTS.md

> 主文档语言：中文 · [English](./AGENTS.en.md)

本文件是给模型的工作准则，与 [PROCESS.md](./PROCESS.md) 同时生效；两者冲突时以更严格的一条为准。

## 必须

- 开工前读 `PROCESS.md`、`docs/gates.md` 与 `docs/architecture.md`，确认改动类型与影响范围。
- 只在允许前缀的分支上工作，一个 PR 只做一件事。
- 提交前本地运行 `node scripts/ci-gate.mjs`，全绿才 push。
- 改行为就改测试；改用户可见内容就同步中英文两份文档与 CHANGELOG。
- 新增或退役已接入插件时，同步更新 `docs/plugins.md` 与 `docs/plugins.en.md`。
- 改 gate、schema、ruleset 或 reusable workflow 时，在 PR 里说明影响并附测试。
- CI 失败时读每行的 `fix:` 提示修根因；修不动就在 PR 里写清尝试过的方案并交给人。

## 禁止

- 把 `ci-gate.mjs` 或 reusable workflow 复制到插件仓（中心仓通过 `@v1` 复用）。
- 把调用方 pin 从 `@v1` 改成 `@main`，或删除 caller workflow。
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
2. 双语文档标题数量一一对应，代码块命令完全一致。
3. CHANGELOG 有本次版本小节，写明改了什么、对使用者有什么影响。

<!-- dsh-review-policy:v1:start -->
## Code Review Rules

- 用中文报告可证明的严重缺陷，写清触发条件、实际影响和最小相关代码位置；避免风格建议及重复 CI 已完成的机械检查。未返回审阅结果不表示通过。
- 检查宿主兼容性与用户数据边界：插件不得意外改变非目标请求、消息、配置或持久化数据；判断影响时遵守本仓明确记录的兼容例外。
- 检查异常、取消、卸载与重复初始化路径：钩子、监听器和共享状态应正确清理；失败回退不得造成重复执行、数据丢失或泄漏敏感信息。
- 审阅只发表意见。不得自动修复、添加人工批准标签、合并、改版本或发布；保留现有 CI 与人工批准流程。
<!-- dsh-review-policy:v1:end -->

### 中心 CI 审阅重点

- 检查权限提升、发布凭据和 tag/release 链路；策略或 reusable workflow 改动必须保持下游 @v1 输入、检查名和配置契约兼容，不能为单仓放宽全局门禁。

# 流程

这份文档定义一个改动从想法到发布的完整路径。模型必须按顺序执行，任何一步的红色状态都会阻断下一步。

## 角色

- 人：决定做什么、审阅并批准 PR、添加 `human-approved` 与 `ci-change` 标签、决定版本号、打 tag。
- 模型：读文档、开分支、写实现与测试、跑 gate、开 PR、修红项、维护双语文档与 CHANGELOG。

## 一次改动的完整流程

1. 读 [AGENTS.md](./AGENTS.md) 与 [docs/gates.md](./docs/gates.md)，确认改动类型与影响范围。
2. 从最新 main 开分支，分支名带类型前缀。
3. 同一提交内改完代码、测试、双语文档或 CHANGELOG。
4. 本地跑 gate，必须全绿再 push；插件仓用中心仓发布的命令，不复制脚本。
5. 开 PR，按模板逐项勾选，写清动机与验证方式。
6. CI 的 `ci / ci-ok` 全绿且标签齐全后由人合并；合并后删除分支。

标签是在 `pull_request` 事件载荷里读取的。加完 `ci-change` / `human-approved` 后必须产生一次新的 `pull_request` 事件；不要用 rerun，它复用旧载荷。caller 的 `pull_request.types` 已包含 `labeled` 与 `unlabeled`，加标签会自动触发新的 run。

```bash
git switch main
git pull --ff-only
git switch -c feat/my-change
```

## 分支与提交

- 允许的前缀：`feat/`、`fix/`、`chore/`、`docs/`、`refactor/`、`test/`、`release/`。
- 提交信息用祈使句，一句话说明改动；一个 PR 只做一件事。
- 版本号、tag 与 npm 发布只能走 release 流程，模型不得自行发布。

## CI 失败时

- 先读失败行的 `fix:` 提示，按提示修根因，不要改 gate 绕过。
- 不允许新增 `.only`、`.skip`、`@ts-ignore`、`eslint-disable`。
- 改动 caller workflow、`ci.config.json`、schema 或中心仓策略需要维护者加 `ci-change` 标签，模型不得自己加。
- 反复失败时在 PR 里写清已尝试的方案，交给人判断，不要静默重试。

## 版本与发布

1. 在 `release/x.y.z` 分支上改版本号，同时在两份 CHANGELOG 写同一个版本小节。
2. 合并进 main 后由人打 tag，tag 必须等于版本号。
3. caller 的 `release.yml` 调用中心仓 reusable release 工作流，完成 npm 发布、GitHub Release 与发布后核对。

```bash
git tag v1.0.0
git push origin v1.0.0
```

## 复用工作流如何生效

插件仓的 `.github/workflows/*.yml` 只是 caller，用 `@v1` 指向中心仓；中心仓修 bug 或加检查后，所有仓库下一次 CI 自动使用新逻辑，不需要同步脚本。

这个 pin 是契约：模型不得改成 `@main`、不得把 gate 复制回本仓、不得删除 caller。`wiring.workflows` 会拒绝这些改动。

## 禁止事项

- 在本机执行 `npm publish`。
- 复制或手改 `ci-gate.mjs`，或把中心仓脚本 vendor 进插件仓。
- 删除或改写 PR 模板中的必勾项。
- 对 main 强推、绕开 `ci / ci-ok` 合并、或合并自己未通过 CI 的 PR。

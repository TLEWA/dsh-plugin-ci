# 流程

> 主文档语言：中文 · [English](./PROCESS.en.md)

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
6. CI 的 `ci / ci-ok` 与 `pr-guard / guard` 全绿且标签齐全后由人合并；合并后删除分支。

标签由 gate 在运行时通过 GitHub API 读取（`DSH_CI_PR_LABELS` 仅供测试覆盖），所以重跑也能看到刚加的标签；PR 描述同样实时读取，作者补勾清单后重跑即可通过。CI 中读取失败时 gate 直接失败，不会退回旧事件快照放行。`--pr` 检查跑在独立的 `.github/workflows/pr-guard.yml`（check 名 `pr-guard / guard`），与 verify 的六格矩阵解耦：改标签或 PR 描述只重跑这一条轻量 job，矩阵不再跟着白跑。加完 `ci-change` / `human-approved`，或编辑 PR 描述（`edited`）后，caller 的 `.github/workflows/ci-rerun.yml` 会重跑同一 commit 上已有的 `pr-guard` run，而不是新建一次 run：重跑只是原 run 的新 attempt，check run 原位替换，同一 SHA 上始终只有一套状态，ruleset 不会因为两套 suite 判 BLOCKED。因此 caller 的 `ci.yml` 与 `pr-guard.yml` 都不监听 `labeled` / `unlabeled`，也不需要为重跑补空提交；`opened` / `synchronize` 之外的事件不会再启动 verify。`ci-rerun.yml` 用 `pull_request_target` 运行：fork PR 的 `pull_request` token 只读、拿不到 `actions: write`；该工作流不检出 PR 代码，只在可信上下文里调 API 重跑。拆分是渐进式 opt-in：`ci.yml` 传 `with: separate-guard: true` 并由 `pr-guard.yml` 单独跑 guard；未迁移的旧 caller 不传该开关时 guard 仍随 `reusable-ci.yml` 运行，行为不变，gate 只提示迁移。迁移时 `pr-guard.yml`、`separate-guard: true` 与 `ci-rerun.yml` 的 `pr-guard` 目标要一次改全。

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
4. 如果 npm 版本已存在而 GitHub Release 缺失或资产不全，在 Actions 手动运行 `release.yml` 并输入 tag；恢复只重建 GitHub Release，不会再次 `npm publish`。

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
- 对 main 强推、绕开 `ci / ci-ok` 或 `pr-guard / guard` 合并、或合并自己未通过 CI 的 PR。

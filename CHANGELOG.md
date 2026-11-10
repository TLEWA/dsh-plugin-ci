# 更新日志

> 主文档语言：中文 · [English](./CHANGELOG.en.md)

## [1.0.5] - 2026-11-11

- `ci-rerun.yml` 的并发组改为串行执行（`cancel-in-progress: false`）：两个标签一起加时不再互相取消，避免同一 SHA 留下 cancelled 的 check run、把 PR 的 `mergeStateStatus` 变成 `UNSTABLE`；重复的重跑请求会被幂等跳过。

## [1.0.4] - 2026-11-11

- `ci-rerun.yml` 的并发控制移到 job 层：无关标签（增删）不再启动任务、不会取消正在等待或执行的重跑；组仍按 PR 编号隔离。

- `ci-rerun.yml` 的并发组改用 PR 编号（`github.event.pull_request.number`）：不同 fork 的同名源分支不再共享并发组、互相取消等待中的重跑。

## [1.0.3] - 2026-11-11

- 标签变化不再新建 CI run：新增 `.github/workflows/ci-rerun.yml`，加 `ci-change` / `human-approved` 时重跑同一 commit 上已有的 `ci` run。重跑只是原 run 的新 attempt，check run 原位替换，同一 SHA 只保留一套 check suite，修复“建 PR 再加标签”产生两次 CI、ruleset 判 `BLOCKED`、`gh pr checks` 却全绿的问题；caller 的 `ci.yml` 不再监听 `labeled` / `unlabeled`。

- 标签门（`guard.g5` / `guard.g9`）改为运行时通过 GitHub API 读取标签（`DSH_CI_PR_LABELS` 仅供测试覆盖），重跑能看到刚加的标签；新增对应回归测试。

- 标签与 PR 描述都在 gate 运行时实时读取，作者补勾清单后重跑即可通过；CI 中读取失败时 gate 直接失败（fail closed），不再静默回退旧事件快照，避免已撤销的标签仍被放行。

- `ci-rerun.yml` 使用 `pull_request_target`：fork PR 的 `pull_request` token 只读，无法请求 `actions: write`；该工作流不检出 PR 代码，只在可信上下文里调 API 重跑。

- `wiring.workflows` 新增两条接线检查：缺少 `ci-rerun.yml`，或 `ci.yml` 仍监听标签事件，都会失败并给出修复提示；`dsh-ci-init` 同步生成 `ci-rerun.yml`。
- 新增 Codex PR 审阅公共规则模板、只读本地一致性检查及双语接入/验收指南；保留原有 CI、人工批准与发布流程。

- 新增已管理 DSH 插件索引：`docs/plugins.md` 与 `docs/plugins.en.md`，并在 README 文档表、`ci.config.json` 的 `docs.pairs` / `docs.required` 中登记。

## [1.0.2] - 2026-11-10

- `dsh-ci-init` 新增 `--npm-token`：在 release caller 的 `reusable-release.yml` 调用下写入 `with: use-token: true`，支持修补已有 caller 且可重复执行；默认仍走 OIDC。新增 3 个初始化器测试。

## [1.0.1] - 2026-11-10

- 发布手册补充可移动 `v1` tag 的推进步骤；本次发布把 `v1` 指向 v1.0.1 的发布提交，插件仓的 `@v1` 调用随之更新。
- 补齐 canonical 文档的英文镜像：新增 `docs/gates.en.md`、`docs/model-playbook.en.md`、`docs/release.en.md` 与 `AGENTS.en.md`，将中文确立为主文档语言、英文版统一使用 `.en.md` 后缀；README、PROCESS、AGENTS、CHANGELOG 增加语言切换，ci.config.json 把新增文档纳入 `pairs`/`required`。
- 新增 `reusable-release-recover.yml` 与 release caller 的 `workflow_dispatch`：npm 已发布但 GitHub Release 缺失或资产不全时，输入 tag 补建/修复，可选 `dry_run`；恢复前核对 tag/version、main 祖先、registry `gitHead`/provenance 与本地打包 integrity，绝不重新 `npm publish`。
- 修复恢复流程无法覆盖 GitHub 保留的 `GITHUB_SHA`，导致 `--after-publish` 误判发布提交：workflow 改用 `DSH_CI_EXPECTED_SHA`，gate 优先读取它并回退到 `GITHUB_SHA`。
- 修复 `--after-publish` 只等待 15 秒导致 registry 传播较慢时发布工作流误报；默认改为约 10 分钟（120 × 5 秒），可用 `DSH_CI_REGISTRY_ATTEMPTS` / `DSH_CI_REGISTRY_DELAY_MS` 覆盖。
- 为 `--after-publish` 的 registry 等待新增回归测试：本地假 registry 覆盖“先 404 后 200”和“重试耗尽”两条路径，并支持 `DSH_CI_REGISTRY_URL` 指向测试服务，避免再依赖真实 npm 传播时间做验收。
- 修复 caller 的 `pull_request` 触发器缺少 `labeled` / `unlabeled`，加标签后不必再单独 push；中心仓模板与自用 workflow 已同步。
- 修复 canonical 的 `release.yml` 未调用 `reusable-release.yml`，导致 GitHub Release 缺少 `*.tgz` 与 `SHA256SUMS` 资产。
- 修复 `apply-rulesets.mjs` 把 HTTP 方法拼进 endpoint，导致 `gh api` 返回 404。

## [1.0.0] - 2026-11-09

### 新增

- `ci-gate.mjs`：零依赖、单命令的 verify / release / PR guard 校验器，共 17 项 verify、7 项 release、9 项 guard。
- 三个 reusable workflow：CI 矩阵与 `ci-ok` 聚合、OIDC 发布、每周 drift 巡检；插件仓只需薄 caller 并用 `@v1` 调用。
- `init-repo`、`apply-rulesets`、`check-drift`、`release-notes`、`scan-adopt` 五个配套脚本，以及 `ci.config.json` 的 JSON Schema 与 main/tag ruleset。
- 新增 `wiring.prepublish` 与本地发布守卫：发布型仓库的 `prepublishOnly` 必须调用 `dsh-ci-gate --prepublish`；`dsh-ci-init` 会在缺失时写入。
- 53 个测试覆盖 gate、workflow、schema、ruleset 与 release notes；外加双语架构文档、模型手册与发布手册。

### 变更

- 从“复制脚本 + sync-ci 同步”改为“模板 + reusable workflow + 策略源 + ruleset + drift”的五层结构。
- required check 统一为 `ci / ci-ok`；发布由 caller 的 `release.yml` 调用中心仓 reusable workflow，OIDC 为默认路径。
- `reusable-release.yml` 读取 `release.publish`：为 `false` 时只创建 GitHub Release，不执行 `npm publish` 与发布后校验。
- `--after-publish` 对 registry 传播延迟最多重试 6 次；gate 内部异常返回退出码 2；`wiring.workflows` 只接受真正的 YAML `uses:` 行，不再被注释欺骗。

### 移除

- 删除 `sync-ci.mjs`、`ci-process.json` 与 `stamp.self` 检查，仓库里不再保存 gate 副本。
- 配置删除 `install`、`gate` 与未使用的 `release.assetAlias`；新增可选 `$schema` 与 `selfHosted`。
- `dsh-ci-init` 移除从未生效的 `--repo` 参数；它只作用于当前目录。

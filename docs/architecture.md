# 架构

> 主文档语言：中文 · [English](./architecture.en.md)

这个仓库不是“每个插件仓库复制一份校验脚本”，而是五层结构：模板层、复用层、策略层、强制层、巡检层。策略只写一次，所有仓库在下一次 CI 生效。

## 分层

| 层 | 位置 | 职责 |
| --- | --- | --- |
| 模板层 | `templates/` | 下游仓库只复制一次薄声明：caller workflow、`ci.config.json`、PR 模板、AGENTS.md |
| 复用层 | `.github/workflows/reusable-*.yml` | 真正执行 CI、发布与巡检；下游用 `@v1` 调用 |
| 策略层 | `scripts/`、`schema/`、`rulesets/` | 唯一事实源：检查逻辑、配置契约、保护规则 |
| 强制层 | 各仓库的 GitHub ruleset | 把 `ci / ci-ok` 变成合并的硬条件，禁止强推与删 tag |
| 巡检层 | `reusable-drift.yml`、`check-drift.mjs` | 每周发现落后的 `@vN` 与被人为改坏的接线 |

## 模板层只写声明

下游仓库的 `.github/workflows/ci.yml` 只有十几行：触发条件、权限、并发，加一个 `uses: TLEWA/dsh-plugin-ci/.github/workflows/reusable-ci.yml@v1`。它不包含任何检查逻辑，因此不会被顺手改坏，也不需要随中心仓升级而重写。

`init-repo.mjs` 负责写入这些文件，并且只写一次。模板是给人读的起点，不是需要持续同步的副本。

## 复用层承载执行

`reusable-ci.yml` 做三件事：PR 只跑 `--pr`；矩阵跑 verify（Ubuntu 与 Windows × Node 20/22/24）；最后由 `ci-ok` 聚合所有结果。`reusable-release.yml` 负责 tag 发布；`reusable-drift.yml` 每周比对版本。

需要中心仓自己代码的步骤，用 GitHub 官方支持的 `job.workflow_repository` 与 `job.workflow_sha` 把中心仓 checkout 到 `.ci`。这两个上下文指向 reusable workflow 所在的仓库与提交，而不是调用方。

## 策略层是唯一事实源

`scripts/ci-gate.mjs` 在工作区根目录运行，读取调用方的 `ci.config.json`，检查调用方的代码。它通过 `.ci/scripts/ci-gate.mjs` 被调用，从不进入调用方仓库的历史。

`schema/ci.config.schema.json` 定义配置契约；`rulesets/*.json` 定义 main 与 tag 的保护。两者和 gate 一起版本化，任何仓库都不能私自放宽。

## 强制层用 ruleset 固定结果

`rulesets/main.json` 要求唯一 required check `ci / ci-ok`，禁止删除分支、强推与合并提交。`rulesets/tags-v.json` 保护 `v*.*.*`，防止已发布版本被覆盖，同时放过可移动的 `v1`。

TLEWA 目前是个人账号，GitHub 的 organization ruleset 不可用，所以 `apply-rulesets.mjs` 逐仓下发同一份 JSON。将来建立 org 后，这份 JSON 可以直接提升为 org ruleset。

## 巡检层兜底

`reusable-drift.yml` 每周运行一次：`check-drift.mjs` 读出三个 caller 里 pin 的 major，和中心仓最新 release 比较；落后就失败并开（或复用）一个 `[ci] policy drift` issue。

gate 的 `wiring.workflows` 同时防止回退：有人把 gate 脚本复制回仓库、删掉 caller、或改成 `@main`，PR 直接变红。

## 为什么不再复制脚本

旧做法是 `sync-ci` 把 `ci-gate.mjs` 复制到每个仓库。问题是：修一个 bug 要发 N 个 PR；某个仓库忘了同步，检查就静默变旧；副本还可以被本地修改，规则失去意义。

reusable workflow 是 GitHub 原生能力，调用方 pin 一个 ref 就得到同一份逻辑。副本因此从“同步产物”变成“违规信号”。

## 为什么不用 composite action

composite action 的 `uses` 不能写表达式，无法在 action 内引导中心仓；而在 reusable workflow 里引用本地 action，会解析到调用方仓库，产生第二个版本 pin。reusable workflow 自己就能拿到 `job.workflow_repository` 与 `job.workflow_sha`，只需要一个 pin。

## 版本契约

调用方一律 pin `@v1`。中心仓发布 `v1.0.0`，然后把可移动的 `v1` 指向最新的 1.x；只有出现破坏性变更才发布 `v2`，并且永远不把 `v1` 改指向不兼容版本。

破坏性变更包括：caller 的 job id 从 `ci` 改名、聚合 job 从 `ci-ok` 改名、reusable workflow 的输入改名或删除、`ci.config.json` 删除必填键、gate 的退出码或 CLI 语义改变。

## check 名与门禁

GitHub 的 check 名是“调用方 job 名 / 被调用 job 名”。模板里 caller 的 job id 是 `ci` 且没有额外 `name`，reusable 里的聚合 job 是 `ci-ok`，所以 required check 的精确字符串是 `ci / ci-ok`。

矩阵里的子 job 不需要单独 required；`ci-ok` 用 `if: always()` 汇总，skipped 也视为满足。重命名任何一个 job 都等于破坏契约，必须走 major 版本。

## 运行路径与 .ci

CI 的顺序是：checkout 调用方到工作区；checkout 中心仓到 `.ci`；安装 Node；运行 `node .ci/scripts/ci-gate.mjs`。gate 的 `ROOT` 取当前工作目录，因此它检查的始终是调用方，而不是中心仓。

`.ci` 是未跟踪目录，下游 `.gitignore` 必须有 `.ci/`，`release.r3-clean-tree` 会过滤它。仓库里没有 gate 副本，也就没有“改 gate 让自己变绿”的入口。

## 发布与安全

发布首选 npm trusted publishing：OIDC 由 GitHub 签发，`id-token: write` 必须同时出现在 caller 和 reusable workflow；npm 校验的是调用方 workflow 文件名 `release.yml`。`package.json` 的 `repository.url` 必须与 GitHub 仓库完全一致，npm CLI 需要 11.5.1 以上（工作流固定安装 11.21.0）。

尚未配置 trusted publishing 的仓库可以显式打开 `use-token` 并传入 `NPM_TOKEN` 作为回退；两条路径都带 `--provenance`。

## 本仓自己

中心仓 `selfHosted: true`，用自己的 `./.github/workflows/reusable-ci.yml`，不通过网络调用自己；发布只做 gate 与 GitHub Release，不发布 npm。它也不跑 drift，因为它就是策略源。

外部仓库只有在 fork 或离线演练时才允许 `selfHosted: true`，此时必须同时 vendoring gate 与三个 reusable workflow，并自行承担同步成本。

## 个人账号与未来 org

当前所有仓库属于个人账号，ruleset 只能逐仓应用，仓库所有者可以修改，因此“强制”仍依赖维护者不使用 bypass。迁移到 org 后，把同一份 ruleset JSON POST 到 org 级别即可获得统一强制，无需改 workflow 或 gate。

## 改这个仓库

改 gate、schema、ruleset 或 reusable workflow 属于 CI 敏感改动：PR 必须带 `ci-change` 与 `human-approved` 标签，附测试，并在双语 CHANGELOG 写明影响。不能为了某一个仓库放行而放宽全局规则，优先增加可选配置。

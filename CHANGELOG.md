# 更新日志

## [Unreleased]

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

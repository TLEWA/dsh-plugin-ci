# 发布手册

> 主文档语言：中文 · [English](./release.en.md)

发布只由维护者打 tag 触发插件仓的 `release.yml`；它调用中心仓的 reusable release 工作流。模型与本机都不执行 `npm publish`。仓库的 `prepublishOnly` 会调用 `dsh-ci-gate --prepublish`，在本地直接拒绝；CI 里只有 `CI=true` 且 tag 等于版本号时才放行。

## 一次性准备

1. npm 侧二选一：
   - 首选 trusted publishing：在 npmjs.com 的包设置里绑定 GitHub 仓库与调用方 workflow 文件名 `release.yml`，CI 用 OIDC 发布，不需要长期 token。
   - 兼容方式：在仓库 secrets 里放 `NPM_TOKEN`（automation token，需能绕过 2FA），并在 caller 里设置 `use-token: true`；`dsh-ci-init --npm-token` 会自动写入，已有仓库也可重跑该命令。
2. GitHub 侧：
   - caller workflow 的 `permissions` 保持 `contents: write` 与 `id-token: write`；reusable workflow 已声明同样的权限。
   - `main` 应用 `rulesets/main.json`，`v*.*.*` 应用 `rulesets/tags-v.json`；`v1` 这类可移动 tag 不保护。
   - required status check 只设 `ci / ci-ok`。
3. `package.json` 的 `prepublishOnly` 必须调用 `dsh-ci-gate --prepublish`；`dsh-ci-init` 会在缺失时自动写入，`wiring.prepublish` 会检查。
4. 仓库里只需要 caller workflow、`ci.config.json` 与双语文档；不要放 `ci-gate.mjs`、`ci-process.json` 或 `sync-ci.mjs`。

## 发版步骤

1. 从 `main` 开 `release/<version>` 分支。
2. 提升 `package.json` 的 `version`，在两个 CHANGELOG 里写同一版本小节。
3. 开 PR，等 `ci / ci-ok` 绿、维护者加 `human-approved`，合并回 `main`。
4. 在 `main` 的最新提交上打 tag 并推送：

```bash
git tag v<version>
git push origin v<version>
```

5. 观察 `release.yml`：preflight →（`release.publish=true` 时）`npm publish --provenance` → 发布后校验 → GitHub Release。`release.publish=false` 时只创建 GitHub Release，不碰 npm。
6. 发布成功后，把可移动的 `v1` 指向同一个发布提交，供插件仓的 `@v1` 调用：

```bash
git tag -f -a v1 -m "dsh-plugin-ci v1" v<version>^{}
git push origin v1 --force
```

## reusable release 做了什么

1. `--release`：tag 必须等于版本号、必须是 `main` 的祖先、工作树干净、双 CHANGELOG 有该版本、verify 全绿；`release.publish=true` 时 npm 上该版本必须不存在。
2. 读取 `ci.config.json`；只有 `release.publish=true` 才执行 `npm publish --provenance --access public`。优先用 OIDC trusted publishing；`use-token` 时回退到 `NPM_TOKEN`。工作流固定安装 npm 11.21.0，满足 trusted publishing 的最低版本。
3. `--after-publish`：回查 npm registry 的 `gitHead` 是否等于期望的发布提交（优先 `DSH_CI_EXPECTED_SHA`，其次 `GITHUB_SHA`），并检查 `dist.integrity` 与 provenance；registry 传播未完成时默认最多重试 120 次（每次间隔 5 秒，约 10 分钟）；可用 DSH_CI_REGISTRY_ATTEMPTS / DSH_CI_REGISTRY_DELAY_MS 覆盖。
4. `release-notes.mjs` 从中英 CHANGELOG 抽出版本节，用于 GitHub Release。
5. 打包：上传 `<version>.tgz`、`<name>-<version>.tgz` 与 `SHA256SUMS`。

## 失败恢复

- preflight 失败：说明版本或 tag 不对，删 tag 修好后重推；npm 上没有留下任何版本。
- publish 失败：检查 trusted publishing 绑定、`NPM_TOKEN` 权限与包名，不要改 tag 指向已发布的提交。
- after-publish 失败：先看日志里的 registry 状态与等待时长，可能只是传播慢；若包已可读但 gitHead 不一致，说明发布的提交与 tag 不一致，立即停止后续操作，人工核对 npm 上的 tarball 与 git 历史。
- 已发布的版本不可重发：提升版本号，重新走一遍流程。

## 发布恢复

如果 npm 上版本已经存在，但 GitHub Release 没创建、资产缺失或 notes 不对，不要重跑 tag 发布，也不要在本机 npm publish；在 Actions 里手动运行插件仓的 release 工作流：

```bash
gh workflow run release.yml --ref main -f tag=v1.0.6 -f dry_run=true
gh workflow run release.yml --ref main -f tag=v1.0.6
```

恢复流程会 checkout tag、核对 `package.json` 版本、要求 tag 是 `origin/main` 的祖先、通过 `DSH_CI_EXPECTED_SHA` 把 tag 提交传给 `--after-publish` 核对 registry 的 `gitHead` 与 provenance、重新打包并比对 `dist.integrity`，然后创建或更新 GitHub Release（资产用 `--clobber` 覆盖）。`dry_run=true` 只构建并把资产上传到 workflow artifact，不改 GitHub Release；恢复流程绝不执行 `npm publish`。

## 禁止

- 本机 `npm publish`（包括任何发布命令）。
- 强行移动或覆盖已发布版本对应的 tag；可移动的 `v1` 只指向最新的 1.x。
- 在 `feat/`、`fix/` 分支上打 tag。
- 跳过 `ci / ci-ok` 或绕过 ruleset 直接 push `main`。

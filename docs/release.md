# 发布手册

发布只由维护者打 tag 触发 `release.yml`。模型与本机都不执行 `npm publish`；`prepublish.local-guard` 会在本地直接拒绝。

## 一次性准备

1. npm 侧二选一：
   - 首选 trusted publishing：在 npmjs.com 的包设置里绑定 GitHub 仓库与 `release.yml`，CI 用 OIDC 发布，不需要长期 token。
   - 兼容方式：在仓库 secrets 里放 `NPM_TOKEN`（automation token，需能绕过 2FA），`release.yml` 会用它。
2. GitHub 侧：
   - Actions 允许运行 workflow，`permissions` 保持 `contents: write` 与 `id-token: write`。
   - `main` 应用 `rulesets/main.json`，`v*` 应用 `rulesets/tags-v.json`。
   - required status check 只设 `ci-ok`。
3. 仓库里准备好 `scripts/ci-gate.mjs`、`scripts/ci-process.json`、`scripts/release-notes.mjs` 与双语文档。

## 发版步骤

1. 从 `main` 开 `release/<version>` 分支。
2. 提升 `package.json` 的 `version`，在两个 CHANGELOG 里写同一版本小节。
3. 开 PR，等 `ci-ok` 绿、维护者加 `human-approved`，合并回 `main`。
4. 在 `main` 的最新提交上打 tag 并推送：

```bash
git tag v<version>
git push origin v<version>
```

5. 观察 `release.yml`：preflight → `npm publish --provenance` → 发布后校验 → GitHub Release。

## release.yml 做了什么

1. `--release`：tag 必须等于版本号、必须是 `main` 的祖先、工作树干净、双 CHANGELOG 有该版本、npm 上该版本必须不存在、verify 全绿。
2. `npm publish --provenance --access public`：带 OIDC/Sigstore provenance。
3. `--after-publish`：回查 npm registry 的 `gitHead` 是否等于 `GITHUB_SHA`，并检查 `dist.integrity` 与 provenance。
4. `release-notes.mjs` 从中英 CHANGELOG 抽出版本节，用于 GitHub Release。
5. 打包：上传 `<version>.tgz`、`<name>-<version>.tgz` 与 `SHA256SUMS`。

## 失败恢复

- preflight 失败：说明版本或 tag 不对，删 tag 修好后重推；npm 上没有留下任何版本。
- publish 失败：检查 token/trusted publishing 权限与包名，不要改 tag 指向已发布的提交。
- after-publish 失败：说明发布的提交与 tag 不一致，立即停止后续操作，人工核对 npm 上的 tarball 与 git 历史。
- 已发布的版本不可重发：提升版本号，重新走一遍流程。

## 禁止

- 本机 `npm publish`（包括任何发布命令）。
- 强行移动或覆盖已发布版本对应的 tag。
- 在 `feat/`、`fix/` 分支上打 tag。
- 跳过 `ci-ok` 或绕过 ruleset 直接 push `main`。

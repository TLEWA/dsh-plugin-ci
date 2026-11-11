# Release handbook

> Primary documentation language: Chinese · [中文](./release.md)

A release happens only when a maintainer pushes a tag that triggers the plugin repository's `release.yml`; that caller invokes the center's reusable release workflow. Neither a model nor a local machine runs `npm publish`. The repository's `prepublishOnly` calls `dsh-ci-gate --prepublish`, which rejects a local publish; in CI it is allowed only when `CI=true` and the tag equals the version.

## One-time setup

1. npm, choose one:
   - Preferred: trusted publishing. In the package settings on npmjs.com, bind the GitHub repository and the caller workflow filename `release.yml`; CI publishes with OIDC and needs no long-lived token.
   - Compatibility path: store `NPM_TOKEN` in the repository secrets (an automation token that can bypass 2FA), and set `use-token: true` in the caller; `dsh-ci-init --npm-token` writes it, and an already wired repository can rerun that command.
2. GitHub:
   - Keep the caller workflow `permissions` at `contents: write` and `id-token: write`; the reusable workflow declares the same permissions.
   - Apply `rulesets/main.json` to `main` and `rulesets/tags-v.json` to `v*.*.*`; moving tags such as `v1` are not protected.
   - Set two required status checks: `ci / ci-ok` and `pr-guard / guard`.
3. `package.json` `prepublishOnly` must call `dsh-ci-gate --prepublish`; `dsh-ci-init` writes it when missing, and `wiring.prepublish` checks it.
4. A repository only needs the caller workflow, `ci.config.json` and bilingual docs; do not add `ci-gate.mjs`, `ci-process.json` or `sync-ci.mjs`.

## Release steps

1. Branch from `main` as `release/<version>`.
2. Bump `package.json` `version`, and write the same version section in both CHANGELOGs.
3. Open the PR, wait for `ci / ci-ok` and `pr-guard / guard` to be green and a maintainer to add `human-approved`, then merge back to `main`.
4. Tag the latest commit on `main` and push it:

```bash
git tag v<version>
git push origin v<version>
```

5. Watch `release.yml`: preflight → (when `release.publish=true`) `npm publish --provenance` → post-publish verification → GitHub Release. When `release.publish=false`, it creates only the GitHub Release and does not touch npm.
6. After the release succeeds, advance the moving `v1` tag to the same release commit so plugin repositories can call `@v1`:

```bash
git tag -f -a v1 -m "dsh-plugin-ci v1" v<version>^{}
git push origin v1 --force
```

## What the reusable release does

1. `--release`: the tag must equal the version, be an ancestor of `main`, the worktree must be clean, both CHANGELOGs must contain the version, and verify must be green; when `release.publish=true`, npm must not already have the version.
2. Reads `ci.config.json`; only `release.publish=true` runs `npm publish --provenance --access public`. OIDC trusted publishing is preferred; with `use-token` it falls back to `NPM_TOKEN`. The workflow pins npm 11.21.0, the minimum for trusted publishing.
3. `--after-publish`: checks that the npm registry `gitHead` equals the expected release commit (prefer `DSH_CI_EXPECTED_SHA`, then `GITHUB_SHA`), and checks `dist.integrity` and provenance. If registry propagation is incomplete, it retries up to 120 times by default (5 seconds apart, about 10 minutes); override with DSH_CI_REGISTRY_ATTEMPTS / DSH_CI_REGISTRY_DELAY_MS.
4. `release-notes.mjs` extracts the version section from the Chinese and English CHANGELOGs for the GitHub Release.
5. Packaging: uploads `<version>.tgz`, `<name>-<version>.tgz` and `SHA256SUMS`.

## Failure recovery

- preflight fails: the version or tag is wrong; delete the tag, fix it and push again. Nothing has been published to npm yet.
- publish fails: check the trusted publishing binding, `NPM_TOKEN` permissions and the package name; do not retag a commit that has already been published.
- after-publish fails: first check the registry state and wait time in the log; it may simply be slow propagation. If the package is readable but gitHead does not match, the release commit and the tag disagree: stop immediately and compare the npm tarball with the git history by hand.
- A published version cannot be republished: bump the version and go through the flow again.

## Release recovery

If the npm version already exists but the GitHub Release was not created, assets are missing or the notes are wrong, do not rerun the tag release and do not run npm publish locally. Run the plugin repository's release workflow manually from Actions:

```bash
gh workflow run release.yml --ref main -f tag=v1.0.6 -f dry_run=true
gh workflow run release.yml --ref main -f tag=v1.0.6
```

The recovery flow checks out the tag, verifies the `package.json` version, requires the tag to be an ancestor of `origin/main`, passes the tag commit to `--after-publish` through `DSH_CI_EXPECTED_SHA` to compare the registry `gitHead` and provenance, rebuilds the package and compares `dist.integrity`, then creates or updates the GitHub Release (assets are replaced with `--clobber`). `dry_run=true` only builds and uploads the assets to the workflow artifact; it does not change the GitHub Release. Recovery never runs `npm publish`.

## Prohibited

- Local `npm publish` (including any publish command).
- Force-moving or overwriting the tag for an already published version; the moving `v1` points only at the latest 1.x.
- Tagging a `feat/` or `fix/` branch.
- Skipping `ci / ci-ok` or `pr-guard / guard`, or bypassing the ruleset to push directly to `main`.

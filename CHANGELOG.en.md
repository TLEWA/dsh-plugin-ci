# Changelog

## [Unreleased]

- Added `reusable-release-recover.yml` and a `workflow_dispatch` trigger on the release caller: when npm is already published but the GitHub Release is missing or incomplete, pass the tag to create or repair it, optionally with `dry_run`; recovery checks tag/version, main ancestry, registry `gitHead`/provenance and the local tarball integrity, and never runs `npm publish` again.
- Fixed `--after-publish` giving up after 15 seconds when registry propagation was slow; the default is now about 10 minutes (120 × 5 s), overridable with `DSH_CI_REGISTRY_ATTEMPTS` / `DSH_CI_REGISTRY_DELAY_MS`.
- Fixed the caller `pull_request` trigger missing `labeled` / `unlabeled`, so adding a label no longer requires a separate push; the canonical template and self-hosted workflow now match.
- Fixed the canonical `release.yml` not calling `reusable-release.yml`, which left GitHub Releases without `*.tgz` or `SHA256SUMS` assets.
- Fixed `apply-rulesets.mjs` including the HTTP method in the endpoint, which made `gh api` return 404.

## [1.0.0] - 2026-11-09

### Added

- `ci-gate.mjs`: a zero-dependency, single-command verify / release / PR guard with 17 verify, 7 release and 9 guard checks.
- Three reusable workflows: the CI matrix with `ci-ok` aggregation, OIDC publishing, and weekly drift patrol; a plugin repository only needs a thin caller pinned at `@v1`.
- Five helper scripts - `init-repo`, `apply-rulesets`, `check-drift`, `release-notes`, `scan-adopt` - plus the `ci.config.json` JSON Schema and main/tag rulesets.
- Added `wiring.prepublish` and a real local publish guard: publishing repositories must route `prepublishOnly` through `dsh-ci-gate --prepublish`; `dsh-ci-init` writes it when missing.
- 53 tests covering the gate, workflows, schema, rulesets and release notes, plus bilingual architecture docs, the model playbook and the release handbook.

### Changed

- Replaced "copy the script and sync it with sync-ci" with a five-layer model: templates, reusable workflows, policy source, rulesets and drift.
- Unified the required check as `ci / ci-ok`; releases call the center reusable workflow from the caller `release.yml`, with OIDC as the default path.
- `reusable-release.yml` now reads `release.publish`: when it is `false`, only the GitHub Release is created and both `npm publish` and post-publish verification are skipped.
- `--after-publish` retries registry propagation up to six times; internal gate failures exit with code 2; `wiring.workflows` only accepts real YAML `uses:` lines and is no longer fooled by comments.

### Removed

- Removed `sync-ci.mjs`, `ci-process.json` and the `stamp.self` check; repositories no longer keep a gate copy.
- Removed the `install`, `gate` and unused `release.assetAlias` config keys; added the optional `$schema` and `selfHosted` keys.
- `dsh-ci-init` no longer accepts the ineffective `--repo` flag; it always operates on the current directory.

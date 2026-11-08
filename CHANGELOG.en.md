# Changelog

## [Unreleased]

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

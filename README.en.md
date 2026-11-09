# dsh-plugin-ci

The strict CI / PR policy repository shared by the TLEWA DSH plugin repositories. It turns "how to change, how to test, how to release" into executable checks, so a model can only ship through the process.

## What this is

- One center: check logic, config contract, reusable GitHub Actions workflows and rulesets live only here.
- One zero-dependency `scripts/ci-gate.mjs` that runs on Node.js >= 20 with no packages to install.
- Thin templates: a plugin repository copies only a caller workflow and `ci.config.json`, then calls the reusable workflows at `@v1`.
- One hard gate: pull requests accept exactly one required check, `ci / ci-ok`; releases happen only from tags.

## Five layers

| Layer | Location | Purpose |
| --- | --- | --- |
| Templates | `templates/` | Thin declarations copied once by a downstream repository |
| Reusable | `.github/workflows/reusable-*.yml` | Runs CI, releases and drift; downstream pins `@v1` |
| Policy | `scripts/`, `schema/`, `rulesets/` | The single source of truth; no repository may weaken it |
| Enforcement | GitHub rulesets | Makes `ci / ci-ok` a hard merge condition |
| Patrol | `reusable-drift.yml` | Finds stale pins and regressed wiring every week |

See [docs/architecture.en.md](./docs/architecture.en.md) for the design and trade-offs.

## What it enforces

The gate has three modes; any failure exits with code 1:

- verify (default): valid config and wiring, complete manifest, resolvable exports, fresh build artifacts, typecheck and tests, bilingual docs in sync, a CHANGELOG section for the current version, repository hygiene, and a wired local publish guard.
- release: tag equals the version, tag is on main, clean tree, both CHANGELOGs have the version, npm does not already have it, verify is green, and after publishing gitHead plus provenance match.
- guard (pull requests only): checklist fully ticked, compliant branch, no new `.only` or suppression comments, `ci-change` for CI-sensitive files, version bumps only on release branches, and the `human-approved` label.

`wiring.workflows` rejects any change that copies the gate back into a plugin repository, deletes a caller, or switches to `@main`; `wiring.prepublish` requires publishing repositories to route `prepublishOnly` through the canonical gate, so a local `npm publish` is actually blocked.

## Adopting it in a plugin repository

1. Run the initializer at the plugin repository root; it writes the three caller workflows and `ci.config.json`, and adds `.ci/` to `.gitignore`.
2. Edit `ci.config.json` for the real build, test and release flow; declare differences only, never copy check logic.
3. Open the pull request; after the first green CI run, a maintainer applies `rulesets/main.json` and `rulesets/tags-v.json`.

```bash
npx --yes --package=github:TLEWA/dsh-plugin-ci#v1 dsh-ci-init
```

## Local commands

```bash
npx --yes --package=github:TLEWA/dsh-plugin-ci#v1 dsh-ci-gate
npx --yes --package=github:TLEWA/dsh-plugin-ci#v1 dsh-ci-gate --only=manifest,artifacts
npx --yes --package=github:TLEWA/dsh-plugin-ci#v1 dsh-ci-gate --json
```

Inside this repository run `node scripts/ci-gate.mjs`; in CI the command is `node .ci/scripts/ci-gate.mjs`, and it always inspects the caller workspace.

## Repository layout

| Path | Purpose |
| --- | --- |
| `scripts/ci-gate.mjs` | The single gate entry point and CLI |
| `scripts/init-repo.mjs` | Writes the thin templates into a plugin repository |
| `scripts/apply-rulesets.mjs` | Applies or audits rulesets per repository |
| `scripts/check-drift.mjs` | Compares the pinned major with the latest release |
| `.github/workflows/reusable-*.yml` | Reusable CI, release and drift workflows |
| `templates/` | Caller workflows, PR template, AGENTS.md template |
| `schema/` | JSON Schema for `ci.config.json` |
| `rulesets/` | Main and tag protection rules |
| `docs/gates.md` | Full description of every check |
| `docs/model-playbook.md` | How a model should react to red checks |
| `docs/release.md` | Release and recovery handbook |

## Release flow

Releases are tag-driven only; local `npm publish` is forbidden:

```bash
git tag v1.0.0
git push origin v1.0.0
```

A plugin repository `release.yml` calls this repository reusable release workflow, which runs preflight, the OIDC publish, post-publish verification and the GitHub Release.

If npm is already published but the GitHub Release is missing or incomplete, run the release workflow manually from Actions with the tag (optionally with `dry_run`); it rebuilds only the GitHub Release and never runs `npm publish` again.

## Rules for models

Models must follow [AGENTS.md](./AGENTS.md): read [PROCESS.md](./PROCESS.md) first, commit only on `feat/`, `fix/` and similar branches, treat any red gate line as blocking, and never bypass it with skips or suppressions. The rationale of every check lives in [docs/gates.md](./docs/gates.md); reacting to red checks and releasing are covered in [docs/model-playbook.md](./docs/model-playbook.md) and [docs/release.md](./docs/release.md).

## License

MIT, see [LICENSE](./LICENSE).

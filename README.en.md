# dsh-plugin-ci

The strict CI / PR gate shared by the TLEWA DSH plugin repositories. It turns "how to change, how to test, how to release" into executable checks, so a model can only ship through the process - not around it.

## What this is

- One zero-dependency `scripts/ci-gate.mjs` that runs on Node.js >= 20 with no packages to install.
- One declarative `ci.config.json`: each repository declares only its own build, test, docs and release differences.
- A set of GitHub Actions templates and ruleset definitions that enforce the required check, tag-only releases and tamper resistance.

## What it enforces

The gate has three modes; any failure exits with code 1:

- verify (default): valid config, complete manifest, resolvable exports, fresh build artifacts, typecheck and tests, bilingual docs in sync, CHANGELOG carrying the current version, repository hygiene.
- release: the tag must equal the version, must be reachable from main, the same version must not exist on npm, and after publishing gitHead plus provenance must match.
- guard (pull requests only): checklist fully ticked, branch name compliant, no new `.only` or suppression comments, CI-sensitive files need the `ci-change` label, version bumps only on release branches, and the human `human-approved` label.

## Adopting it in a plugin repo

1. Copy the workflows, PR template and `AGENTS.md` from `templates/`.
2. Write a `ci.config.json` declaring only this repository's differences.
3. Sync the gate with `sync-ci` and run it in CI.

```bash
node scripts/sync-ci.mjs
node scripts/ci-gate.mjs
```

## Local commands

```bash
node scripts/ci-gate.mjs
node scripts/ci-gate.mjs --release
node scripts/ci-gate.mjs --after-publish
```

## Repository layout

| Path | Purpose |
| --- | --- |
| `scripts/ci-gate.mjs` | The single gate entry point |
| `ci.config.json` | This repository's gate configuration |
| `templates/` | Workflows, PR template, AGENTS.md template |
| `schema/` | JSON Schema for the configuration |
| `rulesets/` | GitHub ruleset definitions |
| `docs/gates.md` | Full description of every check |

## Release flow

Releases are tag-driven only; local `npm publish` is forbidden:

```bash
git tag v1.0.0
git push origin v1.0.0
```

## Rules for models

Models must follow [AGENTS.md](./AGENTS.md): read [PROCESS.md](./PROCESS.md) first, commit only on `feat/`, `fix/` and similar branches, treat any red gate line as blocking, and never bypass it with skips or suppressions. The rationale of every check lives in [docs/gates.md](./docs/gates.md).

## License

MIT, see [LICENSE](./LICENSE).

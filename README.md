# dsh-plugin-ci

> 主文档语言：中文 · [English](./README.en.md)

DSH 插件仓库共用的严格 CI / PR 策略仓。它把「怎么改、怎么测、怎么发版」写成可执行检查，模型只能按流程提交。

## 这是什么

- 一个中心仓：检查逻辑、配置契约、GitHub Actions 复用工作流与 ruleset 定义都只存在这里。
- 一个零依赖的 `scripts/ci-gate.mjs`，Node.js >= 20 即可运行，不安装任何包。
- 一套薄模板：插件仓库只复制 caller workflow 与 `ci.config.json`，用 `@v1` 调用复用工作流。
- 一条硬门禁：PR 只认唯一 required check `ci / ci-ok`，发布只认 tag。

## 五层架构

| 层 | 位置 | 作用 |
| --- | --- | --- |
| 模板层 | `templates/` | 下游复制一次的薄声明 |
| 复用层 | `.github/workflows/reusable-*.yml` | 执行 CI、发布与巡检，下游 pin `@v1` |
| 策略层 | `scripts/`、`schema/`、`rulesets/` | 唯一事实源，任何仓库不得私改 |
| 强制层 | GitHub ruleset | 把 `ci / ci-ok` 变成合并硬条件 |
| 巡检层 | `reusable-drift.yml` | 每周发现落后 pin 与回退接线 |

设计与取舍见 [docs/architecture.md](./docs/architecture.md)。

## 强制的内容

校验分三种模式，任一失败即退出码 1：

- verify（默认）：配置与接线合法、manifest 完整、导出存在、产物新鲜、类型与测试通过、双语文档同步、CHANGELOG 有当前版本、仓库卫生、本地发布守卫已接线。
- release：tag 等于版本、tag 在 main 上、工作树干净、双 CHANGELOG 有版本节、npm 上不得已存在该版本、verify 全绿、发布后核对 gitHead 与 provenance。
- guard（只跑 PR）：清单全勾、分支名合规、无新增 `.only` 或抑制注释、CI 敏感文件需 `ci-change` 标签、版本号只能走 release 分支、需 `human-approved` 标签。

`wiring.workflows` 会拒绝任何把 gate 复制回插件仓、删掉 caller、或改成 `@main` 的改动；`wiring.prepublish` 要求发布型仓库把 `prepublishOnly` 接到中心 gate，否则本机 `npm publish` 不会被真正拦截。

## 接入一个插件仓库

1. 在插件仓根目录运行初始化脚本，写入三个 caller workflow、`ci.config.json`，并把 `.ci/` 加进 `.gitignore`。
2. 按插件实际构建、测试与发布方式改 `ci.config.json`；只声明差异，不要复制检查逻辑。
3. 提交 PR；首次 CI 通过后，维护者应用 `rulesets/main.json` 与 `rulesets/tags-v.json`。

```bash
npx --yes --package=github:TLEWA/dsh-plugin-ci#v1 dsh-ci-init
```

使用仓库级 `NPM_TOKEN` 而不是 OIDC 时，加 `--npm-token`；初始化器会为 release caller 写入 `with: use-token: true`。

```bash
npx --yes --package=github:TLEWA/dsh-plugin-ci#v1 dsh-ci-init --npm-token
```

## 本地命令

```bash
npx --yes --package=github:TLEWA/dsh-plugin-ci#v1 dsh-ci-gate
npx --yes --package=github:TLEWA/dsh-plugin-ci#v1 dsh-ci-gate --only=manifest,artifacts
npx --yes --package=github:TLEWA/dsh-plugin-ci#v1 dsh-ci-gate --json
```

在本仓开发时直接运行 `node scripts/ci-gate.mjs`；在 CI 中则是 `node .ci/scripts/ci-gate.mjs`，检查的始终是调用方工作区。

## 文档

主文档为中文；英文版使用 `.en.md` 后缀，与中文版逐节对应。两边的标题层级与代码块命令必须完全一致。

| 主题 | 中文（主文档） | English |
| --- | --- | --- |
| 协作流程 | [PROCESS.md](./PROCESS.md) | [PROCESS.en.md](./PROCESS.en.md) |
| 架构 | [docs/architecture.md](./docs/architecture.md) | [docs/architecture.en.md](./docs/architecture.en.md) |
| 检查动机 | [docs/gates.md](./docs/gates.md) | [docs/gates.en.md](./docs/gates.en.md) |
| 模型手册 | [docs/model-playbook.md](./docs/model-playbook.md) | [docs/model-playbook.en.md](./docs/model-playbook.en.md) |
| 发布手册 | [docs/release.md](./docs/release.md) | [docs/release.en.md](./docs/release.en.md) |
| 模型准则 | [AGENTS.md](./AGENTS.md) | [AGENTS.en.md](./AGENTS.en.md) |
| 更新日志 | [CHANGELOG.md](./CHANGELOG.md) | [CHANGELOG.en.md](./CHANGELOG.en.md) |

## 仓库结构

| 路径 | 作用 |
| --- | --- |
| `scripts/ci-gate.mjs` | 唯一校验入口与 CLI |
| `scripts/init-repo.mjs` | 给插件仓写入薄模板 |
| `scripts/apply-rulesets.mjs` | 逐仓下发或校对 ruleset |
| `scripts/check-drift.mjs` | 比对 pin 的 major 与最新 release |
| `.github/workflows/reusable-*.yml` | CI、发布、巡检的复用工作流 |
| `templates/` | caller workflow、PR 模板、AGENTS.md 模板 |
| `schema/` | `ci.config.json` 的 JSON Schema |
| `rulesets/` | main 与 tag 的保护规则 |
| `docs/gates.md` | 每条检查的完整说明 |
| `docs/model-playbook.md` | 模型遇到红项时的处理手册 |
| `docs/release.md` | 发布与失败恢复手册 |

## 发布流程

发布只能由 tag 触发；本机禁止 `npm publish`：

```bash
git tag v1.0.0
git push origin v1.0.0
```

插件仓的 `release.yml` 调用本仓的 reusable release 工作流，完成预检、OIDC 发布、发布后核对与 GitHub Release。

如果 npm 已发布但 GitHub Release 缺失或资产不全，在 Actions 手动运行 release 工作流，输入 tag（可先勾 `dry_run`）补建或修复；它只重建 GitHub Release，不会再次 `npm publish`。

## 给模型的工作准则

模型必须遵守 [AGENTS.md](./AGENTS.md)：先读 [PROCESS.md](./PROCESS.md)，只在 `feat/`、`fix/` 等分支提交，把 CI 红项当作阻断，不得用跳过或压制绕过。每条检查的动机见 [docs/gates.md](./docs/gates.md)，红项处理与发布见 [docs/model-playbook.md](./docs/model-playbook.md)、[docs/release.md](./docs/release.md)。

## 许可

MIT，见 [LICENSE](./LICENSE)。

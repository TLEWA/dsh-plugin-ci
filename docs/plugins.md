# 已管理的 DSH 插件

> 主文档语言：中文 · [English](./plugins.en.md)

本页是中心仓维护的已接入插件索引。它记录下游仓库与统一 CI 的接线，不复制各插件自己的安装与使用说明。

## 收录范围

一个仓库同时满足以下条件才算“已纳入管理”：

- 根目录有 `ci.config.json`；
- `ci.yml` 调用 `TLEWA/dsh-plugin-ci/.github/workflows/reusable-ci.yml@v1`；
- `release.yml` 调用 `TLEWA/dsh-plugin-ci/.github/workflows/reusable-release.yml@v1`；
- 已应用中心仓的 main ruleset，合并只认 `ci / ci-ok`；
- 发布型仓库已应用 tag ruleset，并使用仓库级 `NPM_TOKEN`（`with: use-token: true`）。

本页不收录未接入中心 CI 的 DSH 插件；本仓自身是 CI 工具，也不在索引内。

## 插件索引

| 插件 | 作用 | 构建 / 测试 |
| --- | --- | --- |
| [dsh-better-choice](https://github.com/TLEWA/dsh-better-choice) · [npm](https://www.npmjs.com/package/dsh-better-choice) | `ask_user_question` 增强：右键选项写补充备注，选择前可先向模型旁问，复用当前会话上下文。 | `npm run build` → `lib`（git-diff）；`npm test` |
| [dsh-fastload](https://github.com/TLEWA/dsh-fastload) · [npm](https://www.npmjs.com/package/dsh-fastload) | 缩小长会话首次打开时的历史页；首屏不足时由 Web 客户端在后台补齐。 | 无需构建；`npm test` |
| [dsh-if](https://github.com/TLEWA/dsh-if) · [npm](https://www.npmjs.com/package/dsh-if) | 自定义 `/if` 命令：fork 子代理判断条件，成立时把下方指令作为普通用户消息发出。 | 无需构建；`node test/run.mjs` |
| [dsh-opencode-go-router](https://github.com/TLEWA/dsh-opencode-go-router) · [npm](https://www.npmjs.com/package/dsh-opencode-go-router) | 维护 OpenCode Go 的热路由 id 池，并在请求即将丢失上游前缀缓存前切换路由。 | 无需构建；`node --test` |
| [dsh-sidebar-organizer](https://github.com/TLEWA/dsh-sidebar-organizer) · [npm](https://www.npmjs.com/package/dsh-sidebar-organizer) | 七区域侧栏、工具条与菜单的长按拖拽排序和收纳，布局可导入导出。 | `npm run build` → `lib`（git-diff）；CI 不跑测试（`test: null`） |
| [dsh-sidebar-row-menu](https://github.com/TLEWA/dsh-sidebar-row-menu) · [npm](https://www.npmjs.com/package/dsh-sidebar-row-menu) | 给 DSH 侧栏的工作区行和会话行加右键菜单，含打开方式、更多操作与归档清理。 | `npm run build:client` → `lib`（git-diff）；`npm test` |
| [dsh-utf8-output](https://github.com/TLEWA/dsh-utf8-output) · [npm](https://www.npmjs.com/package/dsh-utf8-output) | 修复 Windows 下 DSH 子进程 GBK/CP936/CP932 输出乱码，在字节被解码前重新解码。 | 无需构建；`node test/run.mjs` |
| [dsh-ptc-noargs](https://github.com/TLEWA/dsh-ptc-noargs) · [npm](https://www.npmjs.com/package/dsh-ptc-noargs) | 修复 PTC `run_code` 中无参工具调用被拒绝的问题：在 TypeScript function-body 程序前注入一行 prelude，把省略或 undefined 的首参归一化为 `{}`。 | 无需构建；`npm test` |

## 共同接线

- 表中的仓库都 pin `@v1`；中心仓发布新 major 后，`reusable-drift.yml` 会巡检落后 pin。
- CI 矩阵为 Ubuntu / Windows × Node 20 / 22 / 24，唯一 required check 是 `ci / ci-ok`。
- 发布只由 tag 触发：`release.yml` 调用 `reusable-release.yml@v1`，完成预检、npm 发布、发布后核对与 GitHub Release。
- 表中的发布型仓库均配置为发布 npm 包并开启 provenance。release caller 均使用 `with: use-token: true` 和仓库 secret `NPM_TOKEN`，不走 OIDC。
- 本机发布由 `prepublishOnly` 调用 `dsh-ci-gate --prepublish` 拦截；不要直接运行 `npm publish`。

## 维护规则

- 新增插件时，在同一次接入 PR 中更新本页、README 文档表，以及所有其他插件 README 的交叉索引；改名或退役时同步删除。
- 本页只记接线，不记各插件版本号；版本以各仓 `package.json` 与 npm 为准，避免索引随发版漂移。
- 构建与测试命令来自各仓 `ci.config.json`；修改命令时一并更新本页。
- 核对某个仓库是否仍符合收录范围，先看它的 `ci.config.json` 与两个 caller workflow。

## 相关文档

- [接入说明](../README.md)
- [发布手册](./release.md)
- [检查说明](./gates.md)
- [架构](./architecture.md)

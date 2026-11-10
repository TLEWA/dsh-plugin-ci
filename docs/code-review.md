# Codex PR 审阅

> 主文档语言：中文 · [English](./code-review.en.md)

## 职责与设置

对下表九个仓库启用云端 Codex 自动审阅，覆盖所有作者的 PR，首次就绪及每次新提交触发；草稿阶段暂不审阅。仓库可以遵循已配置的个人偏好；必须核对覆盖范围和触发时机，不能只确认自动审阅开关。设置在 [Codex 设置](https://chatgpt.com/codex/settings/code-review) 中管理，不是 GitHub Actions 配置。

审阅消耗订阅用量；额外 credits 默认关闭，全面审阅默认关闭。具体额度以账号用量页为准。设置未核验、结果未返回、额度耗尽、权限不足均为未完成，不表示通过。若账号不支持每次新提交复审，暂停推广并记录缺口。

Codex 以中文报告严重且可证明的缺陷，描述触发条件、实际影响和代码位置。CI 负责机械检查，人负责人工批准标签和合并。审阅不是批准，也不自动修复、改版本或发布；现有 required check `ci / ci-ok`、ruleset、`human-approved` 和 `ci-change` 由现有流程管理。

## 规则维护与检查

公共规则块由 `templates/AGENTS.md` 与英文对应模板管理，标识为 `dsh-review-policy:v1`。各仓 AGENTS 必须包含实际规则块；外部链接不等于继承。保留块外专属约束，区分源码型和生成型 lib。英文文档存在时一并同步。升级规则逐仓独立 PR，不覆盖整个 AGENTS。

在中心仓运行以下命令（点号替换成目标仓路径）：

~~~bash
node scripts/check-review-policy.mjs .
~~~

检查只读本地文件，不访问 GitHub，不执行目标代码；忽略 CRLF/LF 差异，缺失、过期、内容变更、重复或损坏的规则块返回 1，正确返回 0。英文 AGENTS 存在时也校验。该工具用于接入验收，不加入合并门禁，也不验证云端设置或 PR 审阅结果。新仓使用初始化器 --full 时获得中文规则；既有仓手工合入规则块，禁止通过 --force 覆盖专属说明。

## 日常操作与验收

PR 就绪后，分别检查 CI 和 Codex 审阅；修复后确认审阅对应最新 head SHA。漏触发时由维护者评论 `@codex review`；不能把旧 SHA 的结果用于新提交。每仓记录首次就绪、新提交自动复审和手动补审的 PR、提交 SHA 及结果链接。用一个正常改动和一个明确回归场景评估可定位性与误报；回归演练仅用于隔离验证，不合并缺陷。未获实际结果前不能填写通过。

本地先跑 gate 再跑仓库测试/构建；PR 按模板填写，由维护者添加所需标签。AI 不合并、不加人工批准标签。异常时可关闭自动审阅，保留原有 CI；恢复后请求最新提交审阅。

## 接入记录

2026-11-10，维护者在本任务明确确认九个仓库均已配置为每次推送也自动审阅；首次就绪及最新提交复审仍待实际 PR 验收。下表只记录证据，不将规则文件存在视为云端接入成功。

| 仓库 | 规则版本 | 云端设置 | 验收 PR / SHA / 结果 |
| --- | --- | --- | --- |
| dsh-plugin-ci | v1 （PR 待合并） | 维护者确认触发及连接正常 | [#14](https://github.com/TLEWA/dsh-plugin-ci/pull/14) · `6cc1e34ba3cf` · 尚无 Codex 结果 |
| dsh-better-choice | v1 （PR 待合并） | 维护者确认触发及连接正常 | [#7](https://github.com/TLEWA/dsh-better-choice/pull/7) · `a683434de4a0` · 尚无 Codex 结果 |
| dsh-fastload | v1 （PR 待合并） | 维护者确认触发及连接正常 | [#8](https://github.com/TLEWA/dsh-fastload/pull/8) · `53b0487def8f` · 尚无 Codex 结果 |
| dsh-if | v1 （PR 待合并） | 维护者确认触发及连接正常 | [#6](https://github.com/TLEWA/dsh-if/pull/6) · `8b356999c1fb` · 尚无 Codex 结果 |
| dsh-opencode-go-router | v1 （PR 待合并） | 维护者确认触发及连接正常 | [#10](https://github.com/TLEWA/dsh-opencode-go-router/pull/10) · `0696f96cb319` · 尚无 Codex 结果 |
| dsh-sidebar-organizer | v1 （PR 待合并） | 维护者确认触发及连接正常 | [#6](https://github.com/TLEWA/dsh-sidebar-organizer/pull/6) · `02f849e67934` · 尚无 Codex 结果 |
| dsh-sidebar-row-menu | v1 （PR 待合并） | 维护者确认触发及连接正常 | [#6](https://github.com/TLEWA/dsh-sidebar-row-menu/pull/6) · `010f0449cc0c` · 尚无 Codex 结果 |
| dsh-utf8-output | v1 （PR 待合并） | 维护者确认触发及连接正常 | [#6](https://github.com/TLEWA/dsh-utf8-output/pull/6) · `fb602d4431a4` · 尚无 Codex 结果 |
| dsh-ptc-noargs | v1 （PR 待合并） | 维护者确认触发及连接正常 | [#3](https://github.com/TLEWA/dsh-ptc-noargs/pull/3) · `1af23bfcd90c` · 尚无 Codex 结果 |

本次实施快照：9 仓本地 gate 与仓规测试/构建通过；尚无可见 Codex 审阅、评论或 PR 接收反应。中心仓 #14 与 row-menu #6 已各请求一次手动补审，请求评论也没有机器人接收反应。维护者再次确认连接及仓库权限正常；原因未确定，不能声称审阅链路正常。router #10 已产生第二次实际提交，用于观察 synchronize 复审；首次审阅、新提交自动复审、手动补审及隔离回归质量场景均未完成。

合并门禁仍等待维护者添加 `ci-change` 与 `human-approved`。原目录 router/organizer 的已有 AGENTS 修订已获授权并纳入各自 PR，原本机工作目录未重置；不要在 PR 合并前丢弃它们。

# AGENTS.md

Shared review policy excerpt. Preserve repository-specific instructions when adopting this block.

<!-- dsh-review-policy:v1:start -->
## Code Review Rules

- Report provable serious defects in Chinese, with the trigger, actual impact, and smallest relevant code location. Avoid style suggestions and mechanical checks already covered by CI. No review result does not mean approval.
- Check host compatibility and user data boundaries: plugins must not accidentally change unrelated requests, messages, configuration, or persisted data. Respect compatibility exceptions explicitly documented by the repository.
- Check errors, cancellation, disposal, and repeated initialization: hooks, listeners, and shared state must be cleaned up correctly. Fallbacks must not cause duplicate execution, data loss, or sensitive information leaks.
- Reviews provide feedback only. Do not automatically fix code, add human approval labels, merge, change versions, or publish. Preserve existing CI and human approval processes.
<!-- dsh-review-policy:v1:end -->

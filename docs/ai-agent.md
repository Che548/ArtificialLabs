# Context-aware medical Assistant

The health-aware Assistant is separate from the ordinary AI chat and is gated
by its own versioned consent. The Expo client builds a bounded, redacted health
context locally and Yandex AI Studio receives it only through authenticated
Convex actions. Yandex request logging is disabled by the provider adapter.

The Assistant can search encrypted local journal entries, confirmed structured
test results, document metadata, chat history, and the current care plan. Journal
entries from the latest 30 days are included by default. Older entries are only
returned by explicit search and are labelled with their age. Documents are
metadata-only in this release: PDF/image extraction and OCR are intentionally
not implemented, and original files never leave the device.

Autonomous plan review is disabled by default. When enabled by both deployment
flags and the user setting, the app waits for 30 seconds of stable connectivity
and a successful authenticated Convex response. Yandex may propose only from a
server-owned catalogue subset. The client and server independently validate
risk, date range, counts, declined-item cooldowns, and catalogue membership.
All model-derived dates remain provisional. BackgroundTask performs only local
deterministic maintenance; its schedule is opportunistic. Cloud-sync users also
receive a Convex scheduled catch-up using only recently synced structured data.
Foreground autonomous reviews may additionally include bounded new user text
from Assistant-mode conversations and category/date metadata for newly added
documents. Ordinary chats, model answers, document titles, paths, bytes, and
contents are excluded; these signals are unverified and cannot alone create a
Current card.

Configure these values only in the Convex deployment environment:

```text
AI_AGENT_ENABLED=false
AI_AGENT_AUTOMATION_ENABLED=false
```

The existing `YANDEX_AI_*` values are shared with basic chat. Do not add any of
them to `EXPO_PUBLIC_*` variables or to an app bundle.

Agent-specific tests, fixtures, prompts, and live outputs belong only in the
ignored `tests-local/agent/`, `.agent-evals/`, and `.env.agent-test.local`
locations. They are not part of GitHub Actions or release artifacts.

To run the direct provider smoke, put a disposable Yandex key with only the
`yc.ai.languageModels.execute` scope in `.env.agent-test.local`, then run:

```sh
node --env-file=.env.agent-test.local tests-local/agent/yandex-smoke.local.mjs
```

The harness prints only a generic pass/fail line and checks both a non-empty
response and a strict function-tool proposal. It does not use a Convex admin
key. Revoke the disposable Yandex key and delete the local env file immediately
after the run.

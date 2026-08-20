# Minimal Yandex AI Studio chat

The mobile chat calls a Convex Node action; the Expo bundle never receives the
provider key. The action authenticates the user, checks for an active profile
and the current Yandex disclosure consent, validates a text-only transcript,
applies per-user and global burst limits, and calls Yandex's OpenAI-compatible
Responses endpoint. No medical snapshot, attachment metadata, local URI, or
file bytes are read by the action. The provider request sets
`x-data-logging-enabled: false`, disables SDK logging and automatic retries,
and records only request ID, status, latency, and token-count metadata.
The limits are burst-only (5 requests/minute per user, capacity 2; 60/minute
globally, capacity 8); version 1 has no daily quota.

Messages remain encrypted in the device SQLCipher database. Chat records and
deletion tombstones are added to the Convex outbox only while medical cloud
sync is opted in; enabling sync queues the existing chat snapshot, and
disabling it clears pending chat outbox rows.

## Deployment configuration

Provision a dedicated service account with `ai.languageModels.user`. Restrict
its API key to the `yc.ai.languageModels.execute` scope, set an expiry, and
record an owner and rotation date. Store these values only in the Convex
deployment environment:

```text
AI_CHAT_ENABLED=false
YANDEX_AI_API_KEY=<secret>
YANDEX_AI_FOLDER_ID=b1gsgkpq0ij4h5tdieid
YANDEX_AI_MODEL=deepseek-v4-flash/latest
```

Do not add them to `.env.local`, an `EXPO_PUBLIC_` variable, GitHub build
arguments, the web image, logs, or test reports. Deploy the new schema,
component, and functions through the existing protected Convex workflow while
the feature flag remains false. Regenerate and commit `convex/_generated` from
that configured deployment.

Before enabling the flag:

1. Run `npm test` and `npm run verify`.
2. Smoke-test signed-in iOS and Android builds, including consent cancellation,
   retry, history reopening, and revocation under **Разрешения и данные**.
3. Approve the provider disclosure and linked privacy-policy wording.
4. Run the explicitly invoked live check with `npm run e2e:yandex`. It creates a
   disposable account and always invokes exact admin cleanup. It never prints
   prompt text, response text, token counts, or credentials.
5. Set `AI_CHAT_ENABLED=true` only after those checks pass.

Rotate or revoke the API key immediately if it may have been exposed. Keep the
old key valid only long enough to verify a staged replacement, then delete it.

## Current and future capabilities

Version 1 is stateless text chat. Clients send at most 20 visible user/assistant
messages and 24,000 characters, always ending with the latest user message.
The provider adapter receives an internal capability list, which is empty in
this release.

Assistant mode can later add server-owned `web_search` (and only then add the
`yc.search-api.execute` key scope), explicit uploads with `file_search`, or
allowlisted MCP/function tools. Each addition requires a separate privacy
review, narrowly expanded key scopes, source rendering, strict file validation
and remote cleanup, and explicit approval before side effects. Existing health
documents must never be uploaded automatically.

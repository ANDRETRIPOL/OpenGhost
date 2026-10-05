# Browser cancellation and readiness

Addresses findings 2–4 of issue #21. The bundled chat/AgentTools path and generic
`tool:run` / `tool:cancel` IPC remain in place, including numeric tab selection.

Browser jobs register before queue/readiness waits. Stop retires active and
queued steps, Hand Back waiters and late continuations. Take Control retains the
input shield until desktop cancellation/cleanup is acknowledged; failed
acknowledgement cannot grant ownership. Hand Back observes a fresh snapshot,
never repeats the interrupted action. Main and mini chats use distinct job IDs.
Non-browser cancellation still uses the existing tool owners.

Readiness is view-owned, rejects after 15 seconds or on failure, close,
replacement, destruction or crash, and can be recreated. Old view events cannot
ready or mutate a replacement. The renderer operation budget is 90 seconds,
main-process budget 75 seconds, CDP/isolated calls 12 seconds, load 30 seconds,
and settling 15 seconds. Cancelled queued entries cannot bypass predecessors.

Stop returns promptly rather than waiting for every desktop acknowledgement.
Every subsequent dispatch checks cancellation. Chromium commands or JavaScript
already issued may still have effects: this is not rollback or hard preemption
of arbitrary page/network work. Read size, covered-ref policy, screenshot
coverage and complete navigation-failure classification are separate fixes.

Run `npm test` and `node test/e2e/browser-cancellation.mjs`. Tests use controlled
guests/bridges and real Electron with isolated profiles, not live providers.

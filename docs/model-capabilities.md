# Conservative model capability metadata

Addresses finding 5 of issue #21 without removing bundled providers or changing
authentication, provider routing or the built-in context engine.

Missing/invalid context is unknown (zero internally), not a fabricated window.
Unknown vision is `null`, distinct from explicit `true` and `false`. Missing,
empty or malformed reasoning lists are empty, not generic capability lists.
Nonblank custom levels and valid reported defaults are preserved. Catalog cache
version 4 invalidates older inferred capabilities while retaining provider keys.

The picker makes neither an image-support nor no-image claim for unknown
metadata. Effort controls hide when no levels are known. Showing a reported
default never saves a user preference; a user choice is saved under the existing
preference key. Unknown context has no percentage/limit and cannot trigger
automatic compaction on every exchange in either main or mini chat. Manual
compaction remains available.

OpenAI/ChatGPT name-only fallback keeps IDs/names, not guessed capabilities.
DeepSeek no longer inserts `none` into unknown lists. Anthropic adaptive levels
come only from explicit capability metadata; enabled budget thinking uses the
application's existing low/high token-budget presets, labelled internally by
`effortSource`, not a claimed provider effort list. No adaptive high default is
invented. An explicit disabled-thinking capability permits `none`.

Outgoing requests omit absent effort/thinking choices and send images only on
strict `true` support. Omission text distinguishes unknown support from confirmed
lack of support. Auxiliary calls select only known levels. Anthropic's required
request output allowance remains an application default (64000), separate from
unknown catalog output capacity; it is not evidence of a model maximum. A known
thinking budget gets an allowance above that budget even for short auxiliary
calls; an explicitly reported output limit too small for it is refused.

Run `npm test` and `node test/e2e/model-capabilities.mjs`. Tests cover offline
provider catalog/request matrices, auxiliary routing, cache invalidation,
main/mini compaction guards and real Electron DOM presentation. No live model
requests or credentials are used.

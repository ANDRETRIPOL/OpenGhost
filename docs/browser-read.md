# Browser read source bound

Addresses finding 10 of issue #21. The isolated guest constructs an HTML prefix
of at most 4 * 1024 * 1024 UTF-16 code units before returning it across IPC.
It does not evaluate full `outerHTML` and slice afterward, either in main or
in the guest. Character data is read/escaped in chunks of at most 4096 units;
iterative ancestor cursors avoid recursive or whole-tree traversal. Templates
are serialized, but frame documents and shadow trees are not entered.

`sourceTruncated` means source was actually omitted, not merely that the buffer
reached the cap. Missing document roots are empty/untruncated. AgentTools keeps
its existing readable-text extraction and 40000-character paging, with a visible
source-cap warning. Each continuation re-reads the live page; no frozen read-ID
contract is added. Source omitted by the cap is not recoverable by paging.

The limit is not a UTF-8/JSON byte guarantee. DOM attribute access still obtains
a whole attribute value; its escaped copy and the IPC return are bounded, not
all DOM/attribute memory. Captured HTML is untrusted data.

Run `npm test` and `node test/e2e/browser-read.cjs`. On this host headless Ozone
crashes before checks; the supported hidden-window fallback
`OPENGHOST_E2E_OZONE=x11 node test/e2e/browser-read.cjs` passes. Fixtures use
isolated profiles, local data pages and an HTTP-blocking test session.

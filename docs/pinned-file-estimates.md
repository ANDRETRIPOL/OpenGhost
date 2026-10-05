# Pinned-file token estimates

Addresses finding 6 of issue #21. Pinned text-file rows now explicitly say
“≈… estimated tokens”. The existing heuristic divides characters by 3.2 and
rounds for display; empty text estimates zero. It is not a tokenizer result,
billing count or proof that content fits a model's context window.

No tokenizer dependency, storage change or pinned-file weight/limit policy is
introduced. Image dimensions and path-only metadata are unchanged.

Run `npm test` and `node test/e2e/pinned-file-estimate.mjs`.

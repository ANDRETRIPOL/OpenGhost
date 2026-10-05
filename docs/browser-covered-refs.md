# Covered browser refs

Addresses finding 7 of issue #21. A ref covered by another element is refused
before mouse input. The ref is checked again after pointer feedback; newly
covered or moved targets also fail without a click. Single and double clicks
follow the same rule. Supplying coordinates alongside a ref does not enable a
fallback click on the obstruction.

`element_covered` identifies the obstruction and advises a fresh snapshot or
explicitly targeting the covering element. Movement reports `stale_target`.
Coordinate-only clicks retain existing behavior. Page hit testing is an
observation, not transactional isolation from subsequent page changes.

Run `npm test` and `node test/e2e/browser-covered-refs.mjs`.
This patch is based on upstream main, independent of the lifecycle fix; shared
click/error-transport hunks need reconciliation when the two are combined.

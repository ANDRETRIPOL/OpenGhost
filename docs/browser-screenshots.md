# Bounded full-page screenshots

Addresses finding 9 of issue #21. Full-page mode still captures once, at viewport
width and at most four viewport heights, from y=0. It does not stitch images.
`truncated` is true only when measured document height exceeds captured height.
Exact-cap pages are complete vertically, not necessarily horizontally.

Results include `capture` (CSS x/y/width/height), `pageWidth`/`pageHeight` (captured
CSS dimensions), `contentHeight`, `viewportHeight`, and `truncated`. Returned
JPEG `width`/`height` and `scale` describe the resized bitmap, not document size.
The AgentTools adapter preserves these fields and its existing `{text, images}`
shape. Text explicitly describes the capped range and remaining content so the
model receives the limitation even through text-only history conversion.

Ordinary viewport screenshots do not claim full-page coverage. Measurements and
capture are observations of a live page, not an atomic transaction.

Run `npm test` and `node test/e2e/browser-screenshot.mjs`.

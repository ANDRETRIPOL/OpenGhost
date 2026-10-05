# Browser address-bar URL safety

Addresses finding 1 of issue #21. Decoded URLs are untrusted text, not HTML.
The address bar retains its host/path styling and decoding, but creates text
nodes. Only fixed application tab markup is assigned as HTML.

A URL such as `https://example.invalid/%3Cb%20id=%22injected%22%3Ehello%3C/b%3E`
must display literal `<b id="injected">hello</b>`, not create an element. The
Electron regression uses a lazy tab, so no external navigation is needed.

Run `npm test` and `node test/e2e/browser-url.mjs`.

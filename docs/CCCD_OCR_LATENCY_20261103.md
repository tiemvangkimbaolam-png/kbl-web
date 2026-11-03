# CCCD OCR latency repair — 3 November 2026

Owner reported approximately ten minutes between uploading a card and filling customer details. Owner authorized the repair and confirmed normal POS exit before installation. This change is limited to identity OCR in purchase, sale and pawn forms; invoice OCR, business calculations, saved transactions, print templates and worker publication are unchanged.

## Installed-code findings

- The actual packaged renderer matched the root source. Its generic AI helper waited for Antigravity before Gemini, then tried available Gemini models sequentially without request/body deadlines.
- Pawn OCR caught failure of that parent helper and restarted model discovery/generation itself. This could compound the delay. The ten-minute complaint was not reproduced using a customer's card.
- With the configured key and no customer information: model listing took 342 ms; the old first-ranked Flash model did not finish a tiny text request within a 20-second probe; a stable Flash-Lite returned the expected code from a generated plain-text image in 3,024 ms.

## Repair

`pos-source/kbl-cccd-ocr.cjs` provides a dedicated direct Gemini path, using the model list available to the current key. It prefers stable Flash-Lite, remembers a successful model in memory, and makes at most two generation attempts. Each generation/body read is bounded to 15 seconds; discovery uses five-second request limits and the overall OCR budget is 40 seconds. Permission errors stop immediately. Reduced thinking and JSON output are requested where supported.

Only the API upload copy of a large image is reduced to a maximum 2,000-pixel edge. Original images, previews and stored records retain their original bytes. Responses must contain a nonempty supported string field before returning to the existing form handlers. Errors expose neither provider response bodies nor credentials. There is no identity-result cache, CLI subprocess or new logging of customer information.

Purchase/sale OCR call this helper directly. Pawn reuses the parent's same client, or its own client when opened standalone, and does not restart the old chain after failure. Existing prompts, field handlers and manual QR entry remain in place.

## Verification and installation

- Nine focused checks pass, including hung fetch/body handling, model fallback, invalid output, simultaneous front/back isolation, original-image preservation, and an AST comparison proving every existing function outside the three OCR handlers is byte-identical to the actual installed source.
- The new client returned the correct code from the generated nonpersonal image in 3,420 ms. This is a transport/vision probe, **not a measured customer-card scan** or a guarantee for every photograph/network condition.
- Installed into the actual POS on the owner's machine after normal exit; reopened through the existing shortcut at 16:08 Vietnam time. Packaged files match the patched root files. All original archive payload bytes and unaffected entry headers remain unchanged.
- Only `renderer.js`, `pawn.html` and the new `kbl-cccd-ocr.cjs` change. Protected main, index, scale, connection, presentation and website-AI files match their pre-install hashes. No business database or settings were written by installation.
- Private local rollback material retains original source files and the original archive header; the original archive can be reconstructed and verified from the preserved payload. Credentials, raw installed source/archive and identity images are excluded from this repository and handoff ZIP.

Actual-card confirmation remains with the owner in the reopened POS. If Gemini is unavailable, bounded failure leaves the existing manual/QR path available rather than waiting indefinitely.

Official API references: [image understanding](https://ai.google.dev/gemini-api/docs/image-understanding), [thinking configuration](https://ai.google.dev/gemini-api/docs/thinking).

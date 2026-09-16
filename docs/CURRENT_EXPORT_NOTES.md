# Current export notes

This Stage 2 package treats the user's uploaded archive as the authoritative current source export. It does not request more source files before GitHub setup.

Two literal references were detected during audit:

- `app.js` contains legacy page mappings for `views/remote.html` on `/remote` and `/price`, while that filename is not present in this export.
- `views/home.html` contains a CSS reference to `/kbl-hero-sky-luxury-clean.webp`, while that filename is not present in this export. The same HOME also contains `/kbl-hero-approved-art.jpg`, which is present.

These observations are recorded for later route/UI regression testing. No replacement file is invented and no production behavior is changed in Stage 2.

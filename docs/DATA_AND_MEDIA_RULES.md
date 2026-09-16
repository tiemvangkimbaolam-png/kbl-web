# Data and media rules

Never deploy GitHub over production runtime data.

Protected server paths:

- `data/`
- `.env`
- `public/uploads/`
- logs and runtime temporary directories

A deployment must update code/static source while preserving these server-side runtime paths.

For true two-origin failover, live JSON data and generated uploads cannot remain independent on each origin. A later migration/replication phase is required before writes can safely fail over between origins.

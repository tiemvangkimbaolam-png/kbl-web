# Kim Bao Lam Public Web

This repository is the code source of truth for the KBL public website.

## Goal

One code change -> GitHub -> automatic deployment to both production origins.
Cloudflare sits in front of the origins so `tiemvangkimbaolam.id.vn` can continue serving traffic when one origin is unhealthy.

## Important boundaries

- GitHub stores code, templates and static assets.
- `data/` is live runtime/business data and must not be committed.
- `.env`, tokens and encryption keys must not be committed.
- `public/uploads/` is generated media and must not be committed as source code.
- Do not delete or clean the current TENTEN server from this repository alone. Cleanup is a separate, audited phase.

## Current app

- Node.js / Express
- Entry: `app.js`
- Start: `npm start`
- Syntax check: `npm run check`
- Health endpoint: `/api/health`

## Safe rollout order

1. Put this repository in a PRIVATE GitHub repository.
2. Run CI only. No production deployment yet.
3. Prepare TENTEN deploy credentials and a restart command.
4. Prepare the free backup Node server.
5. Deploy the same Git commit to both origins.
6. Move runtime data/media to a shared or replicated design.
7. Put Cloudflare failover in front only after both origins pass health checks.

See `docs/` before enabling deployment.
Webhook test 16-09-2026
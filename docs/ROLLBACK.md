# Rollback

Git is the code rollback source.

Production rollback rule:

1. identify the last known-good Git commit;
2. deploy that commit to the affected origin;
3. preserve runtime `data/`, `.env` and generated uploads;
4. restart the app;
5. verify `/api/health` and critical public routes;
6. only then return normal traffic.

Never rollback live business data by replacing `data/` from GitHub. Runtime data recovery is a separate backup procedure.

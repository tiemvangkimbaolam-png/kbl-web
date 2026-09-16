# First GitHub setup

1. Create a PRIVATE repository, for example `kbl-public-web`.
2. Upload the CONTENTS of this `repo/` folder to that repository.
3. Do not add production `.env`, `data/`, private keys, customer files, backups or `node_modules/`.
4. Keep the default branch as `main`.
5. The included CI workflow is safe: it validates source only and does not deploy anywhere.
6. Do not enable any deploy workflow until TENTEN and the backup server are configured and tested.

Recommended branch flow later:

- `preview`: changes under test.
- `main`: approved production source.

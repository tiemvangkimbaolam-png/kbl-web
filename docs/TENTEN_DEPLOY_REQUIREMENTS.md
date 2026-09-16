# TENTEN deploy requirements

Automatic deployment is intentionally NOT enabled yet.

Before enabling it we need these facts from the TENTEN/Plesk account:

- SSH or SFTP host
- port
- deploy username
- application root path
- Node.js restart method/command supported by the hosting plan
- whether SSH keys are supported

Secrets belong in GitHub Actions Secrets, never in repository files.

Deployment must preserve `.env`, `data/`, `public/uploads/`, logs and backups.

A safe deployment sequence is:

1. upload/release code to a new release directory or staged location;
2. install production dependencies;
3. run syntax/source checks;
4. activate/restart;
5. verify `/api/health`;
6. rollback automatically if health fails.

# Target architecture

```text
Developer / VS Code
       |
       v
GitHub private repository
       |
       +--------------------+
       |                    |
       v                    v
TENTEN origin          Backup Node origin
       |                    |
       +---------+----------+
                 |
             Cloudflare
                 |
      tiemvangkimbaolam.id.vn
```

The repository must remain independent from ChatGPT. ChatGPT is not part of runtime, deployment, DNS, failover or data storage.

## Code

Both origins deploy the same approved Git commit.

## Runtime data

The current application writes persistent files under `data/`. Therefore code redundancy alone is not enough. Before automatic failover is considered complete, both origins need a shared authoritative data layer or safe near-real-time replication.

## Generated media

The application can create media under `public/uploads/`. Generated media needs shared object storage or replication before seamless failover is complete.

## Traffic

Cloudflare is the stable public entry point. Failover is enabled only after both origins can serve the same application state and `/api/health` passes.

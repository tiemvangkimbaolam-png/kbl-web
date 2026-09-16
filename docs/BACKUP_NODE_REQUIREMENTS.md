# Backup Node origin requirements

The second origin can be any suitable free Node/Linux host. It does not have to be Cloudflare.

Minimum requirements:

- Node version compatible with `.node-version`
- persistent disk
- HTTPS or origin TLS behind Cloudflare
- ability to run/restart `node app.js`
- stable outbound network access for enabled integrations
- private environment variables
- health endpoint reachable by the failover layer

The backup origin must run the SAME Git commit as the production origin before traffic failover is enabled.

#!/bin/sh
set -eu

required="R2_ACCOUNT_ID R2_BUCKET_NAME AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY"
for name in $required; do
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "KBL HOUSE2: missing required runtime variable: $name" >&2
    exit 70
  fi
done

R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
mkdir -p /mnt/kbl-r2

# Run the FUSE mount in the background; Node must not start on ephemeral state.
tigrisfs --endpoint "$R2_ENDPOINT" -f "$R2_BUCKET_NAME" /mnt/kbl-r2 &
FUSE_PID=$!

ready=0
i=0
while [ "$i" -lt 60 ]; do
  if mountpoint -q /mnt/kbl-r2; then
    ready=1
    break
  fi
  if ! kill -0 "$FUSE_PID" 2>/dev/null; then
    echo "KBL HOUSE2: R2 FUSE process exited before the mount became ready." >&2
    wait "$FUSE_PID" || true
    exit 71
  fi
  i=$((i+1))
  sleep 0.5
done

if [ "$ready" -ne 1 ]; then
  echo "KBL HOUSE2: R2 FUSE mount timed out." >&2
  kill "$FUSE_PID" 2>/dev/null || true
  exit 72
fi

mkdir -p /mnt/kbl-r2/full-runtime/data
mkdir -p /mnt/kbl-r2/full-runtime/uploads/studio
mkdir -p /mnt/kbl-r2/full-runtime/uploads/discovery

rm -rf /app/data
ln -s /mnt/kbl-r2/full-runtime/data /app/data
mkdir -p /app/public
rm -rf /app/public/uploads
ln -s /mnt/kbl-r2/full-runtime/uploads /app/public/uploads

exec node /app/cloudflare-backup/container/bootstrap-env.js

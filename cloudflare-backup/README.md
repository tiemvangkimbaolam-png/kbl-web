# KBL Cloudflare Backup Runtime — Stage 1

Mục tiêu Stage 1: tạo một Cloudflare Worker độc lập trong cùng GitHub repo `kbl-web`, để mỗi lần push GitHub có thể tự build/deploy Worker mà không ảnh hưởng app Node/Plesk hiện tại.

## Chưa phải failover production

Stage 1 chỉ có:
- static backup landing page
- `GET /api/health`
- `GET /api/failover-status`

Chưa có:
- D1 dữ liệu sản phẩm/giá/khách/phiếu cầm
- R2 media
- đồng bộ TENTEN/POS -> Cloudflare
- failover trên domain chính

## Cloudflare Builds

- Worker name: `kbl-backup`
- Root directory: `cloudflare-backup`
- Production branch: `main`
- Build command: để trống
- Deploy command: `npx wrangler deploy`

Sau Stage 1, tạo D1 + R2 và thêm bindings vào `wrangler.jsonc`.

KBL GROWTH AUTOPILOT V1.2.8 · PRIMARY-ONLY CONTROL PLANE
Ngày: 19-09-2026

Mục tiêu:
- Admin / AI / Growth Autopilot / Publisher / Auth KHÔNG còn failover sang House 2.
- House 2 chỉ tiếp tục làm public disaster backup cho website/catalog/gold/media theo cơ chế hiện tại.
- Khi Primary Node/Plesk lỗi, control plane trả thẳng lỗi Primary để thấy đúng bệnh; không còn thông báo House 2 che nguyên nhân.

Đường PRIMARY-ONLY:
- /admin và /admin/*
- /api/admin/* (bao gồm AI Master, Growth Autopilot, Publisher, Content, Analytics...)
- /api/auth/*
- /api/prompt-ai/*
- /api/tryon/ai
- /api/local-ai/worker/*
- /api/video-studio/worker/*

House 2 vẫn giữ cho public/failover:
- Trang public khi Primary chết
- /api/products, /api/gold-price và mirror public liên quan
- catalog media / uploads backup
- backup health/sync/failover management trên backup host

Triển khai:
1) Copy/paste FULL ZIP đè repo hiện tại, KHÔNG xóa data/, uploads/, modules/, .env.
2) Commit/Push main.
3) Plesk Deploy/Update + Restart Node App.
4) Vì bản sửa nằm trong cloudflare-backup/src/index.js, Cloudflare Worker cũng phải được redeploy.
   Nếu repo đang nối Cloudflare Workers Builds thì push main sẽ chạy build/deploy theo cấu hình đó.
   Nếu không có auto build, lệnh deploy của project là:
   cd cloudflare-backup && npm install --no-audit --no-fund && npm run deploy

Dấu hiệu đúng sau deploy:
- Header Admin: V1.2.8 FULL AUTO · PRIMARY-ONLY ADMIN/AI/PUBLISHER
- Request /api/admin/... có header x-kbl-house2-bypassed: 1
- Khi Primary chết: lỗi hiển thị Primary Node/Plesk unavailable, KHÔNG thử House 2 cho Admin/AI/Autopilot/Publisher.

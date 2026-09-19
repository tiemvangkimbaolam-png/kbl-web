KBL GROWTH AUTOPILOT V1.2.6 R3 · SERVER RECOVERY
Ngày: 19-09-2026

LÝ DO CÓ R3
- R1/R2 đã vô tình ghi đè package.json gốc bằng package mới có express 4 + sharp.
- Repo KBL gốc dùng package.json / package-lock đồng bộ với express 5.2.1.
- Docker House 2 chạy npm ci, nên package.json mới không khớp package-lock cũ có thể làm full Node không build/start.
- Triệu chứng thực tế trên Admin: "Primary server is unavailable and House 2 full Node could not start."

R3 SỬA GÌ
1) Khôi phục package.json gốc của repo KBL.
2) Khôi phục package-lock.json gốc đồng bộ package.json.
3) GIỮ NGUYÊN app.js R2: flow 3 ảnh / bài, publisher Facebook/Instagram/Threads/Telegram, TikTok 3 ảnh sạch, static media và fallback.
4) GIỮ patch deterministic overlay ở dạng optional: nếu runtime có Sharp thì dùng; nếu không có Sharp thì tự fallback ảnh AI như trước, không làm Node chết.
5) Chỉ đổi nhãn version Admin thành V1.2.6 R3 để tránh nhầm với V1.2.4.

CÁCH DEPLOY
- KHÔNG xóa repo hiện tại.
- Giải nén R3 và copy/paste đè lên repo kbl-web hiện có để giữ nguyên modules/, data/, uploads/, .env và các phần đã chốt.
- Commit + Push origin.
- Plesk deploy/update code rồi Restart Node App.

COMMIT GỢI Ý
Growth Autopilot V1.2.6 R3 Server Recovery

LƯU Ý
- Không xóa modules/, data/, uploads/, .env.
- R3 không thay AI Master/Gemini Auto/Gold Intelligence/Video/Try-on/Revenue Loop đã hoạt động.

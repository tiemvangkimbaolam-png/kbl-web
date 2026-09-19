KBL GROWTH AUTOPILOT V1.2.9 · PRIMARY API RECOVERY
Ngày: 19-09-2026

VẤN ĐỀ XÁC NHẬN TỪ ẢNH PRODUCTION
- Admin V1.2.8 đã tải được, nên Primary Node còn sống.
- /api/admin/growth-autopilot/status trả HTTP 500.
- /api/admin/growth-autopilot/auto-publish trả HTTP 500.
- Vì vậy lỗi nằm trong Growth API/status path, không phải toàn bộ máy chủ bị chết.

BẢN V1.2.9 SỬA GÌ
1) Growth status không còn để một lỗi phụ làm sập toàn endpoint.
   - platform score: cô lập lỗi theo từng nền tảng.
   - Revenue Loop status: có fallback an toàn.
   - Watchdog: có fallback an toàn.
   - Cost Guard: có fallback an toàn.
   - CSKH connector status: cô lập lỗi từng connector.
2) Publisher connector admin status có try/catch từng nền tảng.
   - Một token/config lỗi không làm toàn trang Đăng bài HTTP 500.
3) Auto Publish route vẫn lưu trạng thái thật; nếu lỗi lưu/tick thì trả detail cụ thể thay vì generic 500.
4) Global server error có errorId và log server-side để lần sau tìm đúng lỗi mà không lộ secret/stack ra trình duyệt.
5) Background AI Master headline reconcile chỉ gọi khi Admin token đã có, tránh 401 đỏ lúc trang vừa khởi tạo.
6) Giữ nguyên Cloudflare Primary-Only Control Plane của V1.2.8.
7) Không đổi package.json / package-lock.json / Cloudflare worker.
8) Không đổi AI Master, Gemini Auto, Gold Intelligence, Try-on, Video, POS/pricing và logic Publisher production ngoài lớp status/recovery.

KIỂM TRA
- node --check app.js: PASS
- Admin inline JS node --check: PASS
- Safe-status smoke test với các dependency giả lập ném lỗi: PASS
- API route set: 252 -> 252, removed 0, added 0
- Admin ID set: 533 -> 533, removed 0, added 0
- package.json: unchanged
- package-lock.json: unchanged
- cloudflare-backup/src/index.js: unchanged

SAU DEPLOY
- Header Admin phải hiện V1.2.9 FULL AUTO · PRIMARY API RECOVERY.
- /api/admin/growth-autopilot/status phải trả 200 kể cả khi một submodule status bị lỗi; lỗi cục bộ sẽ nằm trong growth.runtime.diagnostics.
- Nút BẬT TỰ ĐỘNG ĐĂNG BÀI + ẢNH không còn thất bại chỉ vì status renderer lỗi.

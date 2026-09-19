KBL GROWTH AUTOPILOT V1.2.6 R2 · PRODUCTION 3-IMAGE AUTO PUBLISH
Ngày: 2026-09-19

R2 được tạo sau khi rà lại V1.2.6 trước khi đưa production.

SỬA THÊM SO VỚI R1
- Sửa runtime bug ở deterministic overlay khi Gemini trả image object dạng {mimeType,data}.
- Đóng gói logo KBL production local vào public/uploads/studio/kbl-logo-production.png.
- Đóng gói QR website local vào public/uploads/studio/kbl-website-qr.png.
- QR trỏ đúng https://tiemvangkimbaolam.id.vn và không phụ thuộc Gemini vẽ QR.
- Prompt Gemini mới chỉ dựng scene nhung đỏ/product hero, chừa lower safe area; không cho AI tự render text/logo/QR.
- Poster final dùng deterministic overlay cho logo + QR + SKU + vàng/trọng lượng + giá.
- Bắt buộc probe HTTPS 3/3 poster final trước khi dispatch Publisher; không public đủ 3 ảnh thì không đăng để tránh lỗi upload.
- Threads được vá đúng carousel 3 ảnh: tạo 3 child containers -> parent CAROUSEL -> background publish.
- Facebook / Instagram / Telegram giữ luồng album/carousel/media-group 3 ảnh hiện có.
- TikTok giữ photo post 3 ảnh sạch theo luồng đã chốt; phụ thuộc Production/API permission thực tế.

PHẦN KHÔNG ĐỤNG
- views/admin.html giữ nguyên checksum so với V1.2.5.
- Không thay AI Master, Gemini Auto model selector, Gold Intelligence, Revenue Loop, Content AI, Try-on, Video/Director AI.
- Không thay dữ liệu POS, giá, kho, đơn, customer, token hay .env.

KIỂM TRA TẠI THỜI ĐIỂM ĐÓNG GÓI
- node --check app.js: PASS
- QR local decode: https://tiemvangkimbaolam.id.vn
- Sharp overlay smoke test: PASS trong môi trường build
- Admin HTML checksum: không đổi so với V1.2.5

GIỚI HẠN THỰC TẾ
- Không thể xác nhận API production của Facebook/Instagram/Threads/Telegram/TikTok từ máy build nếu không dùng token production của server.
- Sau deploy, kết quả cuối phải dựa trên Publisher trả Post/Media ID thật; code không giả PUBLISHED.

KBL WEB SAFE MERGED · GROWTH AUTOPILOT V1.2.7 FULL AUTO R4
Ngày: 19-09-2026

MỤC TIÊU
Bật một lần rồi hệ thống tự chạy bài ảnh 3 sản phẩm:
3 SKU thật -> caption -> 3 ảnh -> logo/QR/thông tin -> lịch -> mọi kênh API-ready -> Post/Media ID -> Revenue Loop.

FULL AUTO R4 LÀM GÌ
- One-time migration tự bật Autopilot tổng + Auto Publish + AI Market + Gemini Poster sau deploy.
- Sau lần bật tự động đầu tiên, nếu chủ tiệm tự TẮT thì lần restart sau tôn trọng trạng thái TẮT.
- Mỗi campaign dùng đúng 3 SKU đang đủ điều kiện publish.
- Campaign tự fan-out tới TẤT CẢ kênh ảnh đang API-ready trong nhóm:
  Facebook / Instagram / Threads / TikTok / Telegram.
- Giữ giới hạn Bài/ngày, khoảng cách tối thiểu và cùng-kênh như cấu hình hiện có; nếu nhiều kênh hơn giới hạn ngày thì tự xếp sang khung giờ/ngày kế tiếp.
- Facebook / Instagram / Threads / Telegram ưu tiên 3 poster 4:5.
- TikTok dùng 3 ảnh trưng bày sạch theo flow đã chốt.
- Nếu Gemini, quota, composer hoặc poster public lỗi: Facebook / Instagram / Threads / Telegram tự fallback carousel/album 3 ảnh sản phẩm thật đã materialize HTTPS; không bỏ lịch chỉ vì AI ảnh.
- Nếu bộ SKU có media hỏng: giữ log Review để truy vết nhưng đồng thời tự lập campaign/bộ SKU khác ở vòng kế tiếp.

POSTER
- Nếu server có Sharp: Gemini chỉ dựng scene nhung đỏ; server overlay deterministic:
  logo KBL + QR website + tên SP + SKU + loại vàng + trọng lượng + size + giá + website + SĐT + địa chỉ + CTA.
- Nếu server không có Sharp: không làm server chết và không cần đổi package; Gemini tự dựng poster hoàn chỉnh bằng ảnh SP + logo KBL + QR thật làm input.
- Nếu composer tồn tại nhưng ghép thất bại: KHÔNG đăng poster thiếu thông tin; FULL AUTO chuyển sang 3 ảnh sản phẩm thật.

QR / LOGO ĐÓNG GÓI
- public/uploads/studio/kbl-logo-production.png
- public/uploads/studio/kbl-website-qr.png
- QR đã kiểm tra decode đúng: https://tiemvangkimbaolam.id.vn

AN TOÀN
- Không đổi package.json/package-lock.json so với R3 Server Recovery.
- Không thêm dependency bắt buộc mới nên không tái tạo lỗi npm ci/House2 do package mismatch.
- Không thay route API hiện có.
- Không thay AI Master / Gemini Auto / Gold Intelligence / Try-on / Video / POS pricing / Revenue Loop.
- Video vẫn thủ công như yêu cầu trước đó.
- Chỉ tính PUBLISHED khi Publisher nhận trạng thái/ID thật từ nền tảng.

TRIỂN KHAI
Giải nén -> copy/paste đè repo kbl-web hiện tại -> Commit main -> Push origin -> Plesk Deploy/Update -> Restart Node App.
KHÔNG xóa data/, uploads/ runtime hoặc .env trên server.

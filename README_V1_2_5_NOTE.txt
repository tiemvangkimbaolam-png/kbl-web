KBL GROWTH AUTOPILOT V1.2.5 NOTE
Ngày: 2026-09-19

Mục tiêu sửa theo yêu cầu chủ tiệm:
- Mỗi bài đăng = 3 hình ảnh.
- Mỗi hình = 1 SKU riêng.
- Mỗi hình dùng prompt production thực tế với:
  + ảnh sản phẩm thật
  + logo tiệm KBL
  + QR website tiệm
  + thông tin sản phẩm
  + thông tin tiệm (website / SĐT / địa chỉ)
- Facebook / Instagram / Threads / Telegram: ưu tiên đăng bộ 3 ảnh branded production.
- TikTok: vẫn dùng bộ 3 ảnh trưng bày sạch theo logic cũ.

Các thay đổi chính trong app.js:
1) Thêm hàm dựng prompt production cho từng sản phẩm.
2) Thêm luồng tạo 3 poster riêng bằng Gemini cho 3 SKU.
3) Thay payload xuất bản từ 1 poster đơn sang mảng 3 ảnh branded.
4) Giữ fallback: nếu Gemini/quota lỗi, hệ thống dùng 3 ảnh sản phẩm thật để không bỏ lịch.
5) Lưu item.posterImages để truy vết bộ 3 ảnh.

Lưu ý kỹ thuật:
- QR hiện được lấy qua dịch vụ HTTPS công khai qrserver để gửi làm reference sang Gemini.
- Chất lượng render chữ/QR vẫn phụ thuộc model ảnh. Nếu muốn QR bảo đảm tuyệt đối 100% quét được trong chính file cuối, bước kế tiếp nên thêm hậu kỳ deterministic (compose PNG/SVG server-side) thay vì chỉ phụ thuộc Gemini.

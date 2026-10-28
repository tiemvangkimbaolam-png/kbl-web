# Khôi phục đường dẫn cũ (28/10/2026)

Trang chủ chuẩn là /. /vi và /vi/ chuyển 308 về /, giữ query. Các trang hiện có dưới tiền tố /vi (TV, bảng giá, tin tức, đăng nhập, khách hàng, tra cứu, giỏ hàng, chính sách, bài tin, QR bảo hành, Admin) chuyển về trang thật. Chính sách hỗ trợ có/không .html, để Cloudflare Assets xử lý URL chuẩn như trước.

/san-pham và /vi/san-pham mở khu sản phẩm ở /#products. /san-pham/{sku} chuyển về đường chi tiết đang dùng /vi/san-pham/{sku}; route chi tiết hiện có không đổi. Không chuyển API/worker/OAuth, không mở quyền Admin. Đường không có trang tương ứng vẫn 404; không gom mọi URL sai thành trang chủ.

Kiểm chứng: 146 tests đạt, TypeScript và build Cloudflare đạt. Chạy HTTP thực qua Workerd local: /vi và query đúng 308, các alias TV/bảng giá/sản phẩm/chính sách/Admin đúng đích; TV và chính sách trả 200, URL không tồn tại 404, Admin còn yêu cầu auth. Không cần đổi DNS hoặc cập nhật Windows/POS.

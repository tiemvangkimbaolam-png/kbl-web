# Thiết kế TV trong Admin

Vào Admin → Bảng giá vàng → Thiết kế bảng giá TV. Khung 1600 × 900 (16:9) dùng cùng renderer với /tv. Chọn chữ trực tiếp hoặc chọn trong danh sách, chỉnh font, cỡ, đậm, màu, căn, nội dung tên/địa chỉ, vị trí và kích thước. Kéo thả một ô trong bảng sẽ di chuyển cả bảng. Có mẫu nền, hoàn tác/làm lại (40 bước), tải bản đã lưu; thay đổi chỉ áp dụng sau Lưu mẫu TV. Mở TV rồi bấm Toàn màn hình; TV tự đọc lại mẫu/giá mỗi 30 giây. Không hỗ trợ fullscreen thì dùng điều khiển trình duyệt TV. Khung tự co theo màn hình, có thể có khoảng trống khi tỷ lệ khác 16:9.

Giá và các loại vàng 999.9, 980, 610 chỉ đọc từ nguồn công khai hiện tại; không có giá mẫu. Thiếu loại thì để trống, không dựng giá. Nếu chữ dài hơn ô thì tự co ngang để vừa, vì vậy tăng chiều rộng ô trước khi tăng cỡ quá lớn. Địa chỉ/tên để trống sẽ lấy cấu hình tiệm. Có thể tắt từng phần; chịu trách nhiệm nội dung tùy chỉnh. Không tải font ngoài, HTML hoặc script. Ảnh PNG/JPG/WebP tải lên qua Admin được dùng công khai trên bảng TV.

GET /api/public/tv-design trả thiết kế và version; POST /api/admin/tv-design yêu cầu owner, JSON {design,version}. Lưu một record tv-design/main, kiểm tra schema nghiêm ngặt, tọa độ trong khung, font/color allowlist, giới hạn chuỗi. Version cũ trả 409, kể cả hai lần tạo đầu đồng thời; không tự ghi đè. Không đổi giá, nguồn POS, binding, OAuth hoặc khóa Cloudflare. Khi lỗi kết nối TV giữ bản đã nhận và hiển thị cảnh báo, không giả là dữ liệu mới. Trình sửa có cảnh báo khi rời trang còn thay đổi chưa lưu.

Kiểm chứng 28/10/2026: API chạy mã thật trên SQLite/D1 adapter thử; kiểm tra owner, allowlist, giá không đổi, version cũ và tạo đồng thời. Browser Chromium với dữ liệu fixture kiểm tra chọn phần, chỉnh cỡ, kéo thả, hoàn tác/làm lại, lưu, mở TV, chữ giá không vượt ô và Fullscreen API. Các khung 320/375/414/768 không tràn ngang. Đây không phải kiểm tra trên TV vật lý của tiệm.


## Trình thiết kế mở rộng

Khung có 8 điểm kéo đổi kích thước; chọn phần bằng cách bấm khung hoặc danh sách. Nhấp đúp tên/địa chỉ/đơn vị/lớp chữ để gõ trực tiếp, Ctrl+Enter áp dụng, Escape hủy. Thêm tối đa 20 lớp chữ nhiều dòng, hình chữ nhật bo góc hoặc ảnh/logo. Lớp có tên, trước/sau bảng giá, thứ tự, ẩn/hiện, độ hiện, nhân đôi/xóa và khóa vị trí. Khóa vị trí chặn kéo/resize/mũi tên; vẫn cho sửa nội dung, màu. Nâng/hạ áp dụng trong nhóm trước hoặc sau bảng. Các ô giá giữ liên kết dữ liệu, không gõ giá giả.

Thu phóng khung 125/150/200% cuộn bên trong trình sửa, không thay bố cục TV thật. Phím mũi tên 1 px, Shift+mũi tên 10 px, Ctrl+Z/Y, Ctrl+D cho lớp trang trí, Delete xóa/ẩn, Ctrl+S lưu; không chiếm phím khi đang gõ trong ô. Có căn giữa ngang/dọc. Chưa có cộng tác trực tiếp, xoay, xuất PDF/video hay thư viện đồ họa như Canva.

POST /api/admin/tv-image cần owner, chỉ ảnh PNG/JPEG/WebP, tối đa 1,5 MB, kiểm tra magic/type/quota, lưu asset purpose=tv và công khai đúng ảnh đã tải. Ảnh không chứa script/SVG và không nhận URL ngoài. Xóa lớp chỉ xóa tham chiếu trong mẫu, không xóa file có thể được dùng chung. Mẫu cũ schema1 tự nhận layers rỗng; version vẫn chống ghi đè. Giới hạn JSON thiết kế48KB, không nhận giá hoặc mã HTML tùy ý.

# V1.3.7 — khôi phục khởi động sau V1.3.6

**Tài liệu lịch sử. Gói hiện tại là V1.3.8; đọc `00_DOC_TRUOC_V1_3_8.md` trước.**

Bản sửa ngày 20/09/2026. Chưa được triển khai trực tiếp lên hosting của tiệm.

## Lỗi đã tái hiện

V1.3.6 nạp `modules/kbl-growth-poster.js` ngay khi khởi động, và file này gọi `require('jsqr')`. Nếu hosting còn bộ thư viện của V1.3.5, ứng dụng dừng với `Cannot find module 'jsqr'`. Nếu thiếu file poster khi cập nhật, ứng dụng cũng dừng. Kiểm thử trước đó đã cài đủ thư viện nên bỏ sót điều kiện cập nhật hosting này.

Kiểm tra bên ngoài khi nhận phản hồi: `/admin` trả HTTP 500; trang chủ trả HTTP 200 qua `cloudflare-house2-full-ui` (máy chủ dự phòng). Chưa có log của hosting nên chưa khẳng định lỗi thật chỉ có nguyên nhân trên.

## Cập nhật để khôi phục

1. Trong trình quản lý hosting, xác định **Application root đang chạy**, là thư mục chứa `app.js` hiện tại. Sao lưu file mã sẽ thay trước khi cập nhật.
2. Gói ZIP này có các file ở ngay gốc ZIP, không có thêm một thư mục bao ngoài. Giải nén/copy vào đúng Application root. Đừng đặt `app.js` trong `public/`, và đừng chọn một thư mục ZIP lồng bên trong làm Application root mới.
3. Để sửa riêng lỗi khởi động từ V1.3.6, các file thiết yếu là `app.js`, `modules/kbl-growth-poster.js` và toàn bộ `vendor/jsqr/`. Cập nhật thêm `views/admin.html` để thấy nhãn V1.3.7. Gói đầy đủ còn giữ các sửa Home và luồng chuẩn bị ảnh trước đó.
4. Giữ nguyên `.env`, `data/`, `public/uploads/`, cấu hình kết nối và các thư viện đã có trên hosting. ZIP không chứa dữ liệu kinh doanh hoặc thông tin đăng nhập. **Không cần cài thêm jsqr qua npm**: bản 1.4.0 đã được đóng gói trong `vendor/jsqr/`.
5. Dùng nút Restart ứng dụng Node.js trong hosting. Mở lại `/admin` và tải lại hoàn toàn; kiểm tra nhãn V1.3.7. Không cần đổi DNS, token hoặc cấu hình POS để áp dụng bản sửa này.
6. Nếu vẫn báo 500, mở mục Logs/error log của hosting ngay sau lần restart. Cần dòng lỗi đầu tiên và phần stack trace liên quan để xác định nguyên nhân còn lại; che token/mật khẩu nếu chúng xuất hiện. Không sửa ngẫu nhiên đường dẫn hay xóa dữ liệu.

Nếu cần quay lại bản đang hoạt động trước khi xác định lỗi còn lại, phục hồi các file mã đã sao lưu trước cập nhật rồi restart, giữ nguyên dữ liệu và cấu hình hiện tại.

## Bản sửa làm gì

- Đóng gói jsQR 1.4.0 cùng mã nguồn và giấy phép Apache-2.0, bỏ dependency npm mới khỏi package.json/package-lock.
- Chỉ tải mô-đun ảnh lúc tính năng cần dùng. Thiếu mô-đun poster hoặc bộ quét QR không làm dừng toàn bộ website.
- Admin báo rõ bộ ghép ảnh chưa sẵn sàng; kiểm tra QR không được bỏ qua hoặc đánh dấu đạt giả.
- Giữ các sửa V1.3.6: chuẩn bị đủ 3 ảnh, lưu/tiếp tục tiến độ, kiểm tra QR trên poster, giá đổi phải duyệt lại, Tất cả và thanh lọc Home desktop.

## Đã kiểm thử

- Máy chủ Express thật, dữ liệu tạm, chặn mọi yêu cầu ra dịch vụ bên ngoài.
- Không có jsqr trong npm: Home/Admin HTTP 200; bộ quét QR kèm theo đọc đúng QR của tiệm.
- Không có cả hai nguồn bộ quét QR: Home/Admin HTTP 200; composer báo chưa sẵn sàng.
- Không có mô-đun poster: Home/Admin HTTP 200; composer báo thiếu mô-đun.
- API Admin chưa xác thực vẫn trả 401 trong cả ba trường hợp.
- Các kiểm thử chuẩn bị ảnh, cập nhật giá, QR, giao diện, source audit và release đều đạt.

Các kiểm thử không gửi bài lên mạng xã hội, không chứng minh API AI thật đã chạy và không thay thế việc kiểm tra hosting sau cập nhật.

Lệnh kiểm thử cho kỹ thuật viên: `npm run check`, `npm run test:startup`, `npm run test:growth`.

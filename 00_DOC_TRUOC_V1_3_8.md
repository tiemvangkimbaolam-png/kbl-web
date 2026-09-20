# KBL V1.3.8 — ảnh không cần Sharp và khôi phục biểu đồ thế giới

Ngày 20/09/2026. Bản mã đã sửa và kiểm thử; chưa được triển khai trực tiếp lên hosting của tiệm.

## Hai lỗi lần này

**Tạo ảnh bị chặn:** ảnh Admin cho thấy “Chưa có bộ ghép ảnh Sharp”. Bản Sharp đi kèm trước đây chỉ là bản native Linux x64, có yêu cầu về hệ điều hành/CPU/thư viện hệ thống. Chưa có log để biết chính xác vì sao Sharp không tải trên hosting này. V1.3.8 bổ sung bộ ghép WebAssembly độc lập cùng font tiếng Việt, đọc PNG và quét QR đóng gói sẵn. Luồng chuẩn bị poster vẫn hoạt động khi cả Sharp npm và Sharp trong vendor đều không tải được.

**Biểu đồ không xuất hiện:** mã tìm nút theo tên cũ “Tham khảo thị trường”, còn Home đã đổi thành “Giá vàng thế giới”. Đồng thời chính sách iframe chưa có tên miền `www.tradingview-widget.com` mà mã nhúng TradingView hiện sử dụng. Bản này sửa cả hai nguyên nhân.

## Cách cập nhật

1. Sao lưu mã đang chạy. Giải nén gói vào đúng Application root có `app.js`; ZIP có file ở ngay gốc, không có thư mục bao ngoài.
2. Giữ nguyên `.env`, `data/`, `public/uploads/`, cấu hình kết nối và thư viện hiện có.
3. Cập nhật đầy đủ `app.js`, `modules/`, `vendor/`, `views/`, `public/kbl-market-world-v1.js` cùng các file source khác trong gói. Đặc biệt không bỏ qua `vendor/resvg-wasm/index_bg.wasm`, `vendor/pngjs/`, `vendor/poster-fonts/`, `vendor/jsqr/` và `modules/kbl-poster-portable.js`.
4. Không cần cài thêm Sharp hoặc thư viện npm mới để dùng bộ ghép độc lập. Restart ứng dụng Node.js.
5. Tải lại Admin: nhãn V1.3.8. Bộ ghép sẽ tự chọn Sharp nếu có, hoặc WebAssembly nếu Sharp không tải được. Những bài bị chặn đúng lỗi môi trường Sharp/QR/module trước đó sẽ được scheduler thử lại khi bộ ghép đã sẵn sàng. Có thể bấm **THỬ LẠI BỘ ẢNH** để chạy ngay phần chuẩn bị; nút này không đưa lịch đăng về sớm.
6. Mở Home, Ctrl+F5. Trong bảng giá chi tiết, **Giá vàng thế giới** mở biểu đồ XAU/USD mặc định; **Nguyên liệu** mở lại bảng giá POS. Liên kết **Xem chi tiết & biểu đồ** cũng mở đúng tab.

Không đặt mã server vào `public/`, không xóa dữ liệu và không đổi DNS/token để áp dụng bản này.

## Hành vi đã sửa

- Vẫn tạo đủ 3 poster trước READY; vẫn giữ AI Art Director, Facts, QR và HTTPS. Bộ ghép độc lập chỉ thay phần ghép chữ/logo/QR, không bỏ qua kiểm tra.
- Dùng font đóng gói để giữ dấu tiếng Việt trên hosting không có font hệ thống.
- QR được giải mã từ ảnh cuối và so với đúng địa chỉ website.
- Luồng tiếp tục ảnh còn thiếu và cập nhật lại giá vẫn được giữ.
- Nếu cả bộ ghép độc lập cũng thiếu file, Home/Admin vẫn hoạt động và Admin báo chưa sẵn sàng; không tự đánh dấu ảnh đạt.
- Biểu đồ dùng mã danh mục cố định thay vì dò chữ hiển thị, nên tên nút tiếng Việt/Anh không làm mất chức năng.
- Hiện tăng/giảm khi API có dữ liệu; không biến dữ liệu biến động thiếu thành 0%. Tỷ giá công khai hiển thị USD BÁN RA đúng dữ liệu API hiện tại.
- Lỗi nguồn giá không làm ẩn phần biểu đồ; lỗi tải TradingView có thông báo và có thể thử lại.
- Giữ **Tất cả** và thanh danh mục Home desktop từ V1.3.6.

## Đã kiểm thử

- Full pipeline với tất cả yêu cầu tải Sharp bị chặn: hồi phục bài từng bị chặn vì Sharp, tạo 3 ảnh, giữ ảnh khi quota lỗi, chạy tiếp, lưu READY và cập nhật giá; QR cuối đạt.
- PNG và JPEG đầu vào của bộ ghép độc lập; kiểm tra dữ liệu ảnh nền trong PNG kết quả; xem trực quan chữ tiếng Việt, logo, bố cục và QR.
- HTTP thật: Home/Admin 200, API thiếu xác thực vẫn 401, kể cả thiếu bộ ghép hoặc file thành phần.
- Header HTTP thật cho phép chính xác host iframe TradingView hiện tại.
- DOM Home Việt/Anh: khởi tạo biểu đồ, lên/xuống/thiếu dữ liệu/lỗi API, chuyển tab nhiều lần, không tạo trùng biểu đồ, nhãn tỷ giá.
- Syntax, source audit, release, security và các kiểm thử luồng ảnh trước đó đều đạt.

Chưa xác minh Gemini thật, ảnh sản phẩm thương mại cuối cùng, bài đăng thật hoặc biểu đồ trên hosting sau triển khai. Bộ ghép độc lập hỗ trợ ảnh nền AI PNG/JPEG; định dạng khác sẽ báo rõ lỗi thay vì xuất ảnh nền trống.

Kiểm tra ngay trên hosting nếu cần: `node scripts/check-poster-portable.js`. Lệnh không dùng Sharp, không gọi AI, không ghi dữ liệu kinh doanh và không đăng bài. Kết quả đúng là `PORTABLE_POSTER_OK`. Nếu lỗi, lấy nguyên thông báo này và chẩn đoán composer trong Admin để xử lý tiếp.

Nguồn kỹ thuật: [Sharp installation](https://sharp.pixelplumbing.com/install/), [resvg-js WebAssembly](https://github.com/thx/resvg-js), [TradingView widget script](https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js). Thư viện và font kèm giấy phép trong `vendor/`.

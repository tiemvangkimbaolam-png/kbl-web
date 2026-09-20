# KBL V1.3.6 — sửa chuẩn bị ảnh và danh mục Home (20/09/2026)

Bản sửa từ bộ mã V1.3.5 ngày 19/09/2026. Đã kiểm thử cục bộ; chưa triển khai hoặc xác minh Gemini/tài khoản mạng xã hội thật trên hosting.

## Lỗi đã tìm thấy

1. `kblGrowthSave()` chuẩn hóa và tạo bản sao từng dòng hàng đợi. Hàm chuẩn bị ảnh cũ tiếp tục sửa các đối tượng trước khi lưu, khiến kết quả không được ghi vào hàng đợi hiện tại. Đây là nguyên nhân trong mã có thể làm giao diện giữ PREPARING dù tác vụ đã đi tiếp.
2. Timer mỗi phút và thao tác chạy ngay có thể chạy chồng cùng một bộ ảnh. Bộ tạo ảnh còn xóa cache mỗi lần chuẩn bị, gây mất khả năng tiếp tục phần dở dang.
3. Lỗi không được lưu theo từng campaign; giao diện đánh dấu các bước chưa chạy thành dấu lỗi và không hiển thị ảnh đang hoàn thành.
4. Chân ảnh SVG cao 30% nhưng vị trí dán logo/QR tính theo 22%; logo và QR có thể lệch/đè nội dung. QR QA trước đây chỉ kiểm tra đường dẫn tải ảnh, chưa giải mã QR trên poster.
5. Poster chưa đạt Art Director/QR vẫn có thể chuyển sang ảnh gốc và được đánh dấu fallback-ready. Bản này yêu cầu đầy đủ poster đã duyệt trước khi tự động đăng campaign.

## Bản sửa

- Cập nhật dòng hàng đợi hiện hành theo campaign ID mỗi lần ghi; lưu tiến độ sau từng bước và từng ảnh.
- Chống chạy chồng preparation, timer và dispatch trong một tiến trình Node.
- Giữ ảnh nền/ảnh đã ghép theo từng SKU; lỗi ảnh thứ hai không tạo lại ảnh thứ nhất. Giữ hạn mức AI và thời gian chờ khi hết quota.
- Trạng thái ĐANG CHUẨN BỊ / CHỜ THỬ LẠI / CẦN XỬ LÝ / READY; hiện lý do, thời điểm thử lại và nút THỬ LẠI BỘ ẢNH.
- Chỉ READY khi có đủ 3 poster, Art Director duyệt, Facts đạt, QR đúng, HTTPS đạt và mỗi ảnh có lớp chữ/logo/QR ghép bằng mã.
- Ghép 1080 × 1350 với cùng một bộ tọa độ. QR được giải mã từ ảnh cuối và so với website chính xác.
- Khi giá/thông tin đổi: ghép lại lớp dữ liệu từ ảnh nền đã lưu, duyệt lại; không dùng ảnh giá cũ hoặc tự chuyển sang ảnh thiếu thông tin.
- Nếu giá/thông tin đổi ngay trong lúc AI đang tạo hoặc duyệt ảnh, bộ ảnh phải cập nhật lại trước READY.
- Giữ adapter đăng bài hiện tại. Riêng TikTok vẫn dùng định dạng 3 ảnh nguồn theo thiết kế có sẵn của hệ thống; bản này không thêm product tagging của catalog Meta/TikTok. Mã sản phẩm trên poster là thẻ SKU bằng chữ.

## Home trên máy tính

- Khôi phục nút **Tất cả** cạnh **Nổi bật** để xem cả hàng có sẵn và hàng tham khảo.
- Ghim thanh danh mục, tìm kiếm và bộ lọc phụ (gồm 9999/980) dưới menu chính khi cuộn trong vùng sản phẩm, ở màn hình rộng hơn 980 px. Khoảng cách tự cập nhật theo chiều cao menu; thanh rời đi khi cuộn khỏi vùng sản phẩm.
- **Xem tất cả sản phẩm** mở đúng danh mục Tất cả và xóa từ khóa tìm kiếm cũ, thay vì đưa xuống phần liên hệ.
- Sửa nhãn tiếng Anh theo mã danh mục, tránh lệch tên khi thêm nút mới.
- Kiểm thử DOM với 48 sản phẩm giả lập: Nổi bật 8 → Tất cả 48 → Nhẫn 12 → vàng 980 có 16; tìm kiếm, xóa bộ lọc và nhãn tiếng Anh đạt. Chưa kiểm thử trực quan thao tác cuộn trên bản đã triển khai.

## Cập nhật trên hosting

1. Sao lưu phiên bản mã đang chạy trước khi thay. Giữ nguyên `.env`, `data/`, `public/uploads/`, cấu hình kết nối, logs và bản sao lưu kinh doanh.
2. Cập nhật mã từ gói này vào đúng application root, không đưa `app.js` vào thư mục public. Gói là toàn bộ source; các file thay đổi chính là `app.js`, `views/admin.html`, `views/home.html`, `public/kbl-international-v4.js`, `modules/kbl-growth-poster.js`, `package.json`, `package-lock.json` và tests/CI.
3. Chạy `npm ci --omit=dev` tại application root. Bản này thêm dependency `jsqr` phiên bản cố định 1.4.0 để quét QR. Không bỏ qua bước cài dependency.
4. Chạy `npm run check` và `npm run test:growth`; sau đó restart Node bằng cơ chế Plesk đang dùng. Kiểm thử dùng thư mục tạm, provider giả lập và không gửi bài ra mạng xã hội.
5. Mở lại Admin, tải lại trang hoàn toàn và kiểm nhãn V1.3.6. Theo dõi bộ ảnh hiện có. Nếu cần, dùng THỬ LẠI BỘ ẢNH; thao tác này không kéo lịch đăng về sớm và không bỏ qua quota.
6. Mở Home trên máy tính, bấm Tất cả rồi cuộn danh sách. Thanh lọc phải nằm ngay dưới menu, các bộ lọc Nhẫn/9999/980 vẫn bấm được. Kiểm tra cả tiếng Việt và tiếng Anh; tải lại trang hoàn toàn nếu đang giữ bản cũ.

## Xác nhận trên hệ thống thật

- 3 poster đúng 3 SKU đang trưng bày; tên, giá, vàng, trọng lượng, size (nếu có) lấy từ dữ liệu hệ thống.
- Logo, SĐT, địa chỉ, website đọc được; quét QR trên ảnh đã xuất ra đúng website.
- Art Director và Facts/QR/HTTPS đều đạt trước READY. Mất API key, hết quota hoặc URL ảnh lỗi phải có thông báo cụ thể.
- Khi tới lịch, xác nhận kết quả bằng Post ID/đường dẫn thật từ nền tảng.

Các kiểm thử đi kèm không chứng minh Gemini thật đã tạo thành công, độ đẹp của ảnh do Gemini trả, quyền OAuth thật hoặc bài đã được đăng. Khóa chống chạy chồng là trong một tiến trình; chỉ để một node chủ động chạy scheduler của hệ thống.

Nếu cần quay lại phiên bản trước, phục hồi source và package lock từ bản sao lưu, cài dependency phù hợp rồi restart; không phục hồi đè dữ liệu kinh doanh bằng gói source này.

Tham khảo kỹ thuật: [Gemini image generation](https://ai.google.dev/gemini-api/docs/image-generation), [jsQR](https://github.com/cozmo/jsQR).

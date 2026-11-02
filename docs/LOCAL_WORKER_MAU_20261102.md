# Mẫu tự đăng và kết nối Cloudflare — 02/11/2026

Ràng buộc của chủ tiệm: tuyệt đối không sửa công thức và logic POS, bán hàng, bù trừ, hóa đơn, cầm đồ hoặc dữ liệu. Các file main.js, renderer.js, index.html, pawn.html, shared-scale.js và kbl-connection.cjs của POS đang dùng được đối chiếu SHA-256 và giữ nguyên. Giao diện POS chỉ bổ sung CSS trong @media screen vào stylesheet đã có; không đổi mẫu in hoặc sự kiện nút.

## Mẫu worker

- cards.cjs + card-assets/: ảnh 1080×1350, nền #fffdfb/#fff2e9, chữ #102c43, màu đồng #9b4d2d, theo mẫu TV hiện tại. Tên, SKU, tuổi vàng, trọng lượng, giá và QR lấy từ snapshot; ảnh thật được contain nguyên khung, không cắt hay vẽ lại trang sức.
- Bảng giá chọn đúng 9999/980/610, mỗi mã đúng một dòng, đơn vị đồng/chỉ. Thiếu/trùng mã, sai đơn vị hoặc thiếu giá thì dừng; không sinh số thay thế.
- Video sản phẩm/giá giữ trọn thẻ đã duyệt trong khung 1080×1920, giọng Hoài My và phụ đề từ word-boundaries. Tin tức giữ renderer hiện có. Lời đọc và ảnh mới có hash riêng; cache cũ không bị ghi đè.
- Đầu vào được sao chụp trước await đầu tiên. Giá live thay đổi chỉ thuộc bài kế tiếp; không hủy edition, lease, video hoặc biên nhận đang làm. Không đổi lịch đã lưu của cửa hàng.
- Bản dựng xem trước không gửi bài hoặc ghi hàng đợi production. Tùy chọn preview=true chỉ dùng đối chiếu bố cục, có nhãn chờ đối chiếu ảnh/SKU.

## Kết nối POS

Website dùng API /api/worker/* với token worker riêng. POS gửi /api/sync/* tới loopback 127.0.0.1:39878. Cấu hình pos-link.json chỉ đổi kết nối, không đổi settings.json hay công thức POS. QR vẫn dùng tên miền HTTPS công khai.

Tùy chọn cấu hình worker acceptPosSettingsToken=true cho phép nhận chính token kết nối hiện có của thư mục POS đã chọn, chỉ trên listener loopback có kiểm tra Host/địa chỉ nguồn. Token đọc từ settings.json, không lưu vào source/log hoặc gửi tới Cloudflare. Worker tiếp tục dùng token worker riêng khi gọi server. Mặc định tùy chọn tắt; token khác bị từ chối.

## Hoàn tác khách lẻ

POST /api/worker/pos-void chỉ dành cho sự kiện void của hóa đơn mode=ban, không điện thoại, không originalTransactionId và không có dấu vết đồng bộ loyalty trong state POS. Relay đọc sales_db.json và n10_loyalty_bridge_state.json chỉ để đối chiếu mã phiếu, mode và SKU; không gửi giá vốn, lợi nhuận hoặc thông tin khách.

Cloudflare ghi biên nhận pos-void, tạm ẩn hàng, hủy trạng thái bảo hành tương ứng trong cùng batch. Chỉ snapshot kho POS mới hơn có quyền mở lại hàng. Retry cùng nội dung trả biên nhận đã lưu, không xử lý lại. Phiếu bảo hành đã có điện thoại trên Cloudflare bị chặn. Không có migration mới và không sửa phép tính nào.

Phiếu có điểm/đổi/trả còn cần ledger gốc để chuyển đủ hành vi; endpoint từ chối, không trả thành công giả. Không chạy thao tác hủy hóa đơn production trong nghiệm thu. POS vẫn giữ toàn bộ bước xác nhận và thao tác dữ liệu hiện có.

## Kiểm chứng

- 311/311 kiểm thử chạy qua bằng fixture/SQLite, có dựng FFmpeg thật; API provider mô phỏng không chứng minh bài đã đăng thật.
- Bản video xem trước 1080×1920/20 giây dựng thật với vi-VN-HoaiMyNeural, timingMode=word-boundaries.
- Build Cloudflare qua. TypeScript toàn dự án còn các lỗi sẵn có ở social-connections currentUrl và thiếu thư viện Remotion riêng; không sửa các phần này chỉ để che kết quả.
- Trên máy: worker mới release 2.2.1 khởi động, ghi nhận POS sync mới, không có lỗi/outbox/ảnh chờ tại thời điểm kiểm tra. Khóa và dữ liệu POS giữ nguyên.
- Đội AI cần tài khoản được bật và tiện ích ghép vào worker mới. Nếu chưa ghép thì chưa thể hoàn thành nghiên cứu/duyệt. Sản phẩm cần đủ ba ảnh thật khác nhau đúng SKU; không bật đăng bằng ảnh thiếu hoặc sai mã. Quyền OAuth/biên nhận từng kênh phải nghiệm thu riêng.


## Đội AI theo yêu cầu chủ tiệm
Ưu tiên DeepSeek tìm nguồn/viết, Claude duyệt, Gemini rồi ChatGPT ảnh; Grok hỗ trợ tìm nguồn. Đây là lựa chọn vận hành của chủ, không phải kết luận benchmark. Chỉ ưu tiên tài khoản enabled, paired, ready, heartbeat dưới 90 giây, đúng role, không đang giữ việc và không nằm trong exclude_account. Bận/offline/quota thì dùng tài khoản sẵn sàng còn lại; không giành lại lease hoặc tự duyệt. Luồng ảnh API Gemini hiện có giữ nguyên.

Cấu hình tài khoản thật còn cần owner đăng nhập Cloudflare Access và ghép tiện ích trong đúng Chrome; không sao chép cookie hoặc biến token worker thành quyền Admin.

Bật “Ưu tiên phân việc theo chuyên môn” trong Admin → Đội AI để áp dụng cách chia mới. Mặc định giữ cách chia hiện có; không tự thay cấu hình một đội đang hoạt động. Sau khi chủ đăng nhập và ghép đúng các tài khoản, bật theo yêu cầu đã giao.

## Trạng thái sau đăng nhập chủ tiệm

02/11/2026, khoảng 11:38 giờ Việt Nam: đã bật specialistRouting qua Admin thật. Đã bật Gemini Tủn hiện có và thêm bốn hồ sơ DeepSeek, Claude, ChatGPT, Grok, cùng chọn worker Windows đang kết nối. Có 5 hồ sơ được bật nhưng 0 hồ sơ báo kết nối Chrome; đây là hồ sơ cấu hình, chưa phải năm phiên AI sẵn sàng. Đã gửi lệnh mở đúng Chrome và mã ghép một lần; chủ tiệm phải đăng nhập/ghép tiện ích trong từng Chrome. Không lưu mã ghép vào tài liệu.

Cloudflare Workers Builds kbl-web-moi xác nhận success cho db46f54. Kênh kbl-backup báo failure riêng, chưa sửa. Sáu file nghiệp vụ POS được đối chiếu lại SHA-256, tất cả giữ nguyên.

Groq và Gemini của luồng tư vấn máy chủ hiện báo Chưa gọi được; chưa kết luận nguyên nhân hoặc chứng nhận hoạt động. Các poller API Tenten cũ vẫn chạy và nhận 404; chưa dừng trước khi đội mới ghép đủ. Không xóa bộ cũ, không chép cookie hoặc tài khoản Chrome. AutoProducts giữ tắt vì chưa có đủ ba sản phẩm với ảnh đúng SKU: ảnh duy nhất đang gắn tên Nhẫn có hình giống dây chuyền, cần chủ đối chiếu trước khi đăng.

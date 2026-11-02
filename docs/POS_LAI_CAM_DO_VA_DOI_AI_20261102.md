# Mức lãi/phí cầm đồ và điều phối AI — 02/11/2026

Thay đổi theo yêu cầu mới của chủ tiệm. Các phần bán hàng, đổi bù, giá vàng, giá vốn và giá sản phẩm giữ nguyên.

## Cầm đồ

| Tiền gốc | LS | PTĐ | PĐQ | CPBG | Tổng / 30 ngày |
|---|---:|---:|---:|---:|---:|
| Đến và gồm 100.000.000đ | 1,5% | 0,5% | 0,5% | 0,5% | 3% |
| Trên 100.000.000đ | 1,5% | 0,4% | 0,3% | 0,3% | 2,5% |

Giữ cách đếm gồm cả ngày nhận cầm và ngày kết thúc, tháng chuẩn 30 ngày. Lãi và phí làm tròn riêng đến đồng, giống cơ chế trước. Hai liên in hiện cùng bộ tỷ lệ; form, tra cứu LAN và dữ liệu hiển thị website dùng cùng chính sách theo gốc. Lấy thêm tiền vượt ngưỡng thì phiếu mới dùng mức mới theo gốc mới.

Phiếu đang cầm dùng chính sách theo gốc khi tính kỳ hiện tại. Phiếu đã chốt giữ tỷ lệ đã lưu. Không chạy di trú dữ liệu, không sửa lịch sử đã thu, không phát sinh giao dịch thật. Các tỷ lệ được lưu cùng số tiền khi người dùng xác nhận giao dịch sau đó.

Đã cài bản thay đổi vào `pawn.html` của POS trên máy, giữ bản gốc tại thư mục làm việc để khôi phục. Bảy tệp khác của POS được kiểm tra hash không đổi. POS đang mở chưa bị ép tải lại; sau khi hoàn tất thao tác nhập hiện tại, tải lại POS theo cách bình thường để nhận mã mới.

## Đội AI

- Đã lưu tắt ưu tiên tên model trên Admin. Việc mới được nhận theo khả năng của tài khoản đang sẵn sàng; tài khoản khác có thể thay thế. Giữ duyệt độc lập, giới hạn một việc đang giữ trên mỗi tài khoản và không gửi lại việc có kết quả chưa rõ.
- Chrome Gemini/ChatGPT có khả năng tạo ảnh nhận việc ảnh tin tức linh hoạt. Việc có API key Gemini không còn khóa toàn bộ ảnh tin cho API. Khi trình duyệt tạo ảnh đã ghép còn liên lạc, đường API nhường việc; việc API đang chạy chưa rõ kết quả không bị đổi chủ.
- Thứ tự xử lý giữ đến khi có đủ biên nhận đăng cho các kênh/định dạng đã chọn. Bài đã lên website nhưng còn chờ kênh khác vẫn giữ lượt, kể cả thời gian dãn cách ảnh → video đã cài.
- Giá đổi không thay bản chụp, kết quả, ảnh, lease hoặc biên nhận của tin đang làm. Khi hàng đợi đã hoàn tất và bản giá trước có biên nhận, lấy bản chụp POS thật mới nhất để tạo một lượt tiếp nếu giá khác. Các nhịp giá khi bận được gộp, không tạo dồn từng tick; dữ liệu quá 5 phút hoặc chỉ đổi thời điểm quan sát không sinh bản tin mới.
- Lịch giá khởi đầu 08:00/13:00/19:00 và lịch sản phẩm giữ nguyên. Nhận định 06:30/18:30 vẫn được ghi vào hàng đợi khi còn nhiều tin cũ, chống trùng bằng mã lượt. Nguồn phải được tải và xác minh; lời viết phân biệt dữ kiện với suy luận, nêu các kịch bản và yếu tố Fed/CPI/việc làm/USD/địa chính trị.

Không thêm tài khoản, không đổi khóa/quyền hay chọn thêm kênh đăng. Không đăng bài mẫu lên production. Bản cập nhật không chứng minh tài khoản thật đã tạo ảnh hoặc đã có biên nhận đăng.

## Kiểm chứng

- 325/325 bài kiểm thử hệ thống qua với SQLite thật trong bộ mô phỏng D1/R2.
- Sáu bài kiểm thử chính sách cầm đồ cũng chạy trực tiếp trên tệp POS đã cài. Bao gồm 99.999.999đ, đúng 100 triệu, 100.000.001đ, 120 triệu; một ngày, 30 ngày, năm nhuận; đóng lãi/chuộc trùng, phiếu đã chốt và lấy thêm tiền vượt ngưỡng. Tác động ghi/in/gửi trong phép thử đều được mô phỏng.
- Kiểm tra AST: chỉ mười hàm cầm đồ liên quan tỷ lệ thay đổi và bốn helper được thêm; hàm đếm ngày và toàn bộ markup khác ngoài bốn nhãn tỷ lệ giữ nguyên.
- Bản xem thử trình duyệt dùng dữ liệu mẫu: hai liên ghi đúng, không tràn chữ; đúng 100 triệu một ngày có 50.000đ lãi + 50.000đ phí; 120 triệu một ngày có 60.000đ lãi + 40.000đ phí. Chưa thử máy in thật.
- Build Cloudflare qua. Kiểm tra triển khai và tiến trình tài khoản thật được ghi riêng trong bàn giao cuối.

## Đồng bộ đầu hàng đợi Windows

Gói việc gửi Windows chỉ đưa việc tin tức đang tới lượt; giữ nguyên các việc đã nhận và tư vấn độc lập. Điều này tránh worker chọn bước viết của tin mới rồi bị máy chủ từ chối trong khi bước tìm nguồn của tin cũ vẫn đang chờ. Các việc tin sau vẫn nguyên trong dữ liệu, tự xuất hiện khi tin trước hoàn tất và đủ biên nhận. Kiểm thử xác nhận việc đang chạy không bị ẩn, không xóa hay giao lại.

Bản triển khai đầu c966fe1 và bản sửa hàng đợi 0120ce2 đã được Cloudflare kbl-web-moi xác nhận thành công lần lượt lúc 10:14 và 10:27 UTC ngày 02/11/2026. Trang thật đã hiện điều phối linh hoạt; chín tài khoản ghép được quan sát. Sau chủ tiệm xác nhận chưa thấy yêu cầu gửi, hai lượt tư vấn bị giữ đã được giao lại qua Admin: Gemini sang ChatGPT khác, ChatGPT sang DeepSeek khác. Worker nhận thêm bước tìm nguồn đầu hàng đợi bằng Gemini sau triển khai. Các lượt cũ được giữ bằng chứng và giải phóng hồ sơ. Chưa có bằng chứng bản tin đã xuất bản đủ kênh; trạng thái nhận việc không chứng minh Chrome đã gửi yêu cầu hoặc có kết quả.

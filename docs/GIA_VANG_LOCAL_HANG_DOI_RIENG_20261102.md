# Giá vàng local và hàng đợi riêng — 02/11/2026

Chủ tiệm nhắc lại bảng giá dùng mẫu local đã tạo, không chờ ảnh minh họa Gemini. Đối chiếu nguồn và Admin thật: bản giá 13:00/19:00 đã có bản chụp POS; bản 13:00 vẫn chờ biên tập. Tin tức cũ đang giữ bước ảnh làm chặn toàn bộ hàng đợi chung. Mẫu `windows/cards.cjs` và nhánh `createGoldImages` trong worker đã có; không cần thêm AI vẽ số hoặc ảnh bảng giá.

Điều phối nay có hai đầu hàng đợi: giá vàng và nội dung còn lại. Mỗi luồng vẫn đợi đủ biên nhận đăng trước khi xử lý bản tiếp theo. Bản giá giữ nguyên snapshot, lịch, kênh và thời điểm; giá mới không thay bản đang làm. Việc đang giữ, lease, kết quả/ảnh/biên nhận và dữ liệu POS không bị hủy, chuyển chủ hoặc sửa. API queue, quyền nhận việc, cổng xuất bản và chốt bản giá tiếp đều dùng cùng quy tắc hai luồng. Tư vấn độc lập giữ như cũ.

Luồng giá: nhận bản chụp POS → biên tập → duyệt nội dung → Windows dựng hai thẻ từ mẫu local → đối chiếu thẻ với snapshot → Windows dựng video → đăng và nhận biên nhận. Vẫn duyệt nội dung và thẻ thật; không bỏ cổng kiểm tra. Hướng dẫn duyệt thẻ không còn yêu cầu ảnh minh họa AI; Admin ghi rõ bước dựng local.

Sửa Chrome trước đó được giữ trong cùng nguồn: tiện ích 2.1.4, giữ tab khi sang cảnh tiếp theo, dùng dấu phiên/cảnh đã nhận để tìm lại tab cũ, phân biệt lệnh tiếp tục được xác nhận với lệnh chỉ đọc kết quả. Chỉ phục hồi lần tiếp tục chưa bắt đầu khi chứng minh không có metadata mới, ô chat trống, số phản hồi không đổi và chưa có prompt cảnh 2; trường hợp chưa rõ tiếp tục giữ. Đã cài đúng thư mục Chrome hiển thị `D:/KBL/kbl-web/windows/EXTENSION`, đồng thời cập nhật bản trong bộ worker. Không đổi quyền, mã ghép, cookie hoặc hồ sơ Chrome.

Kiểm tra mới có database SQLite thật trong bộ mô phỏng: bản giá đi tới biên nhận trong khi tin tức giữ nguyên lease; API đưa cả hai đầu luồng, giữ các bản sau; follow-up giá chờ biên nhận của luồng giá và giữ snapshot cũ; không đòi tạo ảnh AI. Toàn bộ kiểm tra, build và kết quả production được ghi tiếp trong checkpoint. Kiểm thử mô phỏng không chứng minh có bài đăng thật.

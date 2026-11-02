# Chi tiết sản phẩm và tư vấn AI — 27/10/2026

## Thay đổi website

- Trang chi tiết, popup và đường dẫn QR dùng chung màn hình: ảnh gốc, mã, tuổi vàng, trọng lượng vàng ròng, tổng trọng lượng/hột nếu POS có gửi, đơn giá vàng POS, tiền công bán, giá món và thời điểm đồng bộ.
- Giữ nguyên số tiền POS gửi; không lấy bảng giá Cloudflare mới để tự tính lại giá món. Trường chưa có dữ liệu được bỏ trống/ghi rõ; không suy đoán trọng lượng hột bằng 0.
- Mapper và server chỉ giữ các trường công khai đã cho phép. Giá vốn, người bán, nhà cung cấp, khách hàng và ghi chú nội bộ không được nhập vào danh mục hoặc hồ sơ tư vấn.
- Các bộ Windows đã gửi posGoldRate/posWorkmanship được server giữ lại sau lần đồng bộ tiếp theo. Để gửi thêm grossLy/gemLy, dùng gói hai file Windows bên dưới.
- Câu hỏi có thể gắn với đúng sản phẩm đang xem. Câu hỏi tự có job ngay khi đội và tư vấn AI được bật; không cần chờ Cron để tạo job.
- Hồ sơ AI lấy giá Cloudflare khi nguồn đó hoạt động, giữ thời điểm và trạng thái cũ/mới; giá sản phẩm POS được phân biệt riêng. Không đưa vault Relay, token worker, thông tin tài khoản hoặc cấu hình nội bộ vào prompt.
- Khung tư vấn hiển thị trạng thái thực tế: tạm dừng, chưa kết nối, đang bận, sẵn sàng. Câu trả lời chỉ xuất hiện sau completion của mô hình hoặc câu trả lời thật từ chủ.

## Windows — chỉ chép đè hai file

Tải `/downloads/KBL_WINDOWS_CHI_TIET_SP.zip`. Chép đè `pos-contract.cjs` và `pos-relay.cjs` vào thư mục `KBL_WINDOWS_MOI` đang dùng. Giữ nguyên `kbl-config.json`, dữ liệu local và hồ sơ Chrome; không chép hai file này vào POS hoặc hosting.

Worker cần được khởi động lại để nạp module mới. Nếu đang chạy nền và chưa có thao tác dừng riêng, có thể khởi động lại Windows sau khi lưu công việc. Nếu chưa bật tự khởi động, bấm `CHAY_NEN.cmd` một lần khi đăng nhập Windows lại. Không cần cài lại POS. File worker đọc dữ liệu POS mỗi phút và gửi lại bản chụp đã chọn.

Gói đầy đủ `/downloads/KBL-WINDOWS-2.zip` cũng được cập nhật cùng hai module; không cần tải cả gói nếu chỉ nâng cấp phần này.

## Nối AI thật một lần

Vào Admin → Đội AI, kiểm tra máy Windows của tài khoản đang online. Dùng thẻ tài khoản có sẵn, bấm Mở đăng nhập và đăng nhập trên đúng Chrome Windows. Bật tài khoản, bật đội, giữ Tư vấn AI được bật. ChatGPT/Gemini có vai trò tạo ảnh mới nhận bước ảnh bản tin. Hạn mức miễn phí, xác minh hoặc đăng xuất của nhà cung cấp có thể làm phiên cần xử lý; trạng thái UI không phải bằng chứng đã có ảnh thật.

Nhánh thử trang sức trên ảnh khách hiện vẫn là xem thử 2D cục bộ. Bản sửa này không tự gửi ảnh khách sang Gemini hoặc tuyên bố đã có AI thử trang sức. Nếu cần nối nhánh đó, phải có đường nhận/upload ảnh và luồng tác vụ ảnh riêng, kèm sự đồng ý rõ ràng của khách.

## Kiểm chứng

Kiểm thử API ứng dụng thật với SQLite/D1 adapter giả lập; kiểm tra mapper, số tiền không đổi, chi tiết công khai, trạng thái AI theo heartbeat, tạo job ngay, chọn sản phẩm, dùng giá cloud mới, nhận completion, quyền xem hội thoại và chặn sản phẩm ẩn. Render React thật được kiểm tra bằng SSR. Không có dữ liệu khách thật trong fixture.

Trình duyệt điều khiển không truy cập được dev server cục bộ (connection refused); chưa có bằng chứng QA trình duyệt trên máy người dùng, đăng nhập AI thật hoặc tạo ảnh thật. Việc giá đã đọc được là xác nhận của người dùng; chưa kiểm chứng giá tự cập nhật khi máy Windows tắt.

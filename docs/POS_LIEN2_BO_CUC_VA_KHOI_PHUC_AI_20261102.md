# POS liên 2, bố cục đổi vàng và tiếp tục cảnh ảnh — 02/11/2026

## Phạm vi và bản sửa

Chủ tiệm cho phép sửa trình bày hai liên, bố cục đổi ngang/đổi bù và luồng Chrome chưa gửi được yêu cầu. Giữ nguyên công thức hiện hành, dữ liệu, phiếu đã chốt và mẫu TV đã lưu. Không xóa thư mục/file cũ.

Mẫu cầm đồ lưu trong `kbl_pawn_full_blueprint` có thể phục hồi dòng LS cũ không mang lớp `label-pawn-rates`. Bản sửa nhận diện dòng LS cạnh mã phiếu trên cả hai liên rồi áp dụng hàm hiển thị hiện hành sau khi phục hồi mẫu. Chỉ hai hàm trình bày thay đổi; mọi hàm khác và markup giữ nguyên. Không ghi lại blueprint hoặc dữ liệu nghiệp vụ. Mốc đúng 100 triệu vẫn thuộc tổng 3%; trên 100 triệu tổng 2,5%, LS cố định 1,5% theo chính sách đã được chủ cho phép trước đó.

Bố cục đổi vàng dùng lại chính các nút/ô nhập: CCCD → giỏ vàng cũ → giá/công/khách/giỏ mới/thanh toán → tìm sản phẩm. Khối nhập vàng cũ chuyển sang phải dưới xem trước hóa đơn. Chuyển về bán hàng khôi phục vị trí gốc. Không sao chép nút hoặc thay handler.

Chrome adapter trước đây có thể trả lời đã nhận việc khi nội dung đang bận rồi bỏ qua lệnh. Bản mới trả từ chối bận rõ ràng; background chỉ khôi phục quyền thử gửi khi nhận được từ chối rõ. Với lượt hai ảnh, chủ đã xác nhận chỉ có ảnh thứ nhất và chưa gửi cảnh thứ hai. Worker cung cấp thao tác xác nhận riêng để tiếp tục đúng cảnh thứ hai, giữ run/nonce/lease và ảnh thứ nhất. Chặn bấm lại, bản nháp khác, metadata khác và chạy trùng sau tải lại adapter. Tiện ích bản 2.1.2 giữ nguyên quyền truy cập.

API dispatch giữ nguyên trạng thái cần đối soát thay vì tự chuyển về đang chạy và gia hạn lease khi Chrome chỉ đang thu kết quả cũ. Bản d136870 đã triển khai Cloudflare thành công lúc 20:46 giờ Việt Nam.

## Bằng chứng kiểm tra

- 335/335 kiểm thử đạt khi chạy lần lượt các file, gồm fixture FFmpeg thực; build Cloudflare đạt. TypeScript toàn repo còn năm lỗi cũ ngoài phạm vi, không tuyên bố đạt.
- Mẫu trình duyệt tách biệt, không hồ sơ khách: blueprint cũ hiển thị đúng cả hai liên tại 100 và 120 triệu. Chưa in giấy hoặc thao tác phiếu thật.
- Hai chế độ đổi vàng và quay lại bán hàng: kiểm tra 209 điều khiển, 111 nút, giữ handler và không trùng ID. Đây là bản xem thử đã loại script nghiệp vụ, chưa phải POS đang mở.
- Worker thật đã thay đúng năm file, sao lưu bản trước; khởi động lại riêng backend. Ảnh thứ nhất và mã lượt/cảnh tiếp theo vẫn nguyên. Cờ chủ xác nhận cảnh thứ hai chưa gửi đã được lưu qua bảng worker.
- Luồng thật đã hoàn thành nghiên cứu, viết và duyệt; đã nhận một ảnh Gemini. Chưa có ảnh thứ hai hoặc biên nhận xuất bản. Không gọi kiểm thử mô phỏng là bài đăng thật.
- Dò bộ cài: 40 file worker khớp; không thiếu file được index/pawn tham chiếu. Các file tài liệu/nguồn Remotion tùy chọn chưa có không phải bằng chứng nguyên nhân gửi Chrome. Bộ dựng FFmpeg/ffprobe/voice đã báo ready. Giữ các tùy chỉnh settings hiện có và không xóa file.

## Tình trạng cài thật và bước tiếp

POS vẫn mở nên Windows khóa `app.asar`. Gói đã được chuẩn bị, kiểm tra chỉ hai entry thay đổi, và sao lưu; lần thay thế bị từ chối do khóa file. Source gốc và archive đang chạy chưa bị thay bởi lần cài thất bại này. Chờ chủ thoát POS bình thường, chạy bộ cài đã chuẩn bị rồi kiểm tra hash. Không đóng cưỡng bức hoặc làm mất bản nhập dở.

Tiện ích KBL trong hồ sơ Gemini Bủn cần bấm Tải lại tại chrome://extensions để nhận code mới đã cài trên đĩa. Giữ tab hội thoại và mã ghép. Cờ tiếp tục cảnh 2 đã đặt: không xác nhận hoặc tạo lượt mới lần nữa. Sau khi nhận ảnh thứ hai, theo dõi duyệt ảnh → dựng → biên nhận đăng; chưa có biên nhận thì không báo hoàn thành tự động hóa.

Không có quyền điều khiển cửa sổ Chrome riêng hoặc POS native qua công cụ hiện tại; hai thao tác đóng POS và tải lại tiện ích đã được giao chủ. Không sao chép hồ sơ, cookie, token hoặc dữ liệu khách vào source/gói bàn giao.

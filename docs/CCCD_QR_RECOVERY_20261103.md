# Khôi phục đọc căn cước và QR — 03/11/2026

Chủ tiệm báo QR VNeID không nhận, đọc ảnh bị ngắt sớm, ảnh đã gửi về POS không có nút đọc lại. Bản sửa này chỉ tác động luồng nhận/đọc thông tin định danh. Không thay công thức bán hàng, thu mua, đổi vàng, cầm đồ, giá hoặc hồ sơ đã lưu.

## Thay đổi

- Bộ đọc căn cước chờ tối đa 60 giây mỗi lượt gọi, ngân sách 150 giây cho một tác vụ; tối đa hai lượt xử lý. Đây là giới hạn chờ, không phải thời gian bắt buộc phải đợi. Lỗi kết nối/quá tải được thử lại có nghỉ; khóa bị từ chối dừng ngay. Có tiến trình và nút Dừng đọc.
- Thu mua, Bán hàng và Cầm đồ có nút Đọc lại mặt trước / Đọc lại mặt sau, dùng ảnh đã nhận. Ảnh được giữ trong bộ nhớ cửa sổ và các khung xem hiện có; không tạo kho ảnh khách mới hoặc thêm bản sao vào Git.
- Mỗi hồ sơ đọc hai mặt lần lượt. Thay ảnh/hủy tác vụ làm kết quả cũ mất hiệu lực. Không ghi đè các trường khách đang sửa trong lúc chờ, kể cả ảnh đang xếp hàng.
- Tab Cầm đồ dùng chung luồng này cho ảnh điện thoại và chọn tệp trên máy tính. Bỏ việc xóa trường khách trước khi biết đọc ảnh có thành công. Không còn nén tệp chọn trên máy xuống 500 px / chất lượng 0,6; bản gửi OCR được xử lý bởi bộ chung tối đa 2.000 px, ảnh gốc vẫn giữ để xem/in.
- QR dùng jsqr 1.4.0 đóng gói tại máy, tải từ npm chính thức, kiểm tra SHA-512 của gói, kèm giấy phép Apache-2.0. Bộ đọc thử ảnh toàn cảnh, kích thước khác và các khung cắt, thêm tăng tương phản. Không gọi AI để đoán nội dung QR.
- Ảnh QR lỗi có nút Đọc lại QR. Remote có hai tài nguyên giải mã được cho phép rõ tên; không mở thư mục POS hoặc tệp cấu hình qua HTTP.
- Trường hợp iPhone/trình duyệt chặn camera trực tiếp trên LAN HTTP: đóng khung camera lỗi và chuyển sang chụp/chọn ảnh. Thông báo phân biệt chuyển ảnh thành công với đọc thông tin thành công trên POS.

## Giới hạn

QR phải chứa thông tin mà bộ phân tích đọc được. QR chỉ có token xác thực động không tự biến thành thông tin căn cước; cần tích hợp xác thực chính thức, hoặc dùng ảnh thẻ/nhập thông tin đã đối chiếu. Không khẳng định hỗ trợ mọi loại mã VNeID.

Ảnh mờ/lóa, QR hỏng, API hết lượt hoặc mất mạng vẫn có thể không trả kết quả. Khi đó ảnh giữ lại để thử lại hoặc chụp mới. Không bỏ giới hạn chờ để quay lại tình trạng treo nhiều phút.

## Kiểm tra đã làm

- 381/381 kiểm tra dự án đạt. Hai kiểm tra địa chỉ được cập nhật để gọi bộ xử lý ảnh thực tế phía sau lớp hàng đợi, giữ nguyên các khẳng định về địa chỉ, tên, CCCD, ngày cấp và số lần làm mới.
- 11 kiểm tra riêng trên ứng viên gồm hủy nhà cung cấp không phản hồi, đọc lại không tải ảnh mới, hàng đợi hai mặt, đổi ảnh, hồ sơ thay đổi, sửa tay, QR thường/đảo màu/tương phản thấp, cú pháp và đối chiếu các hàm cũ ngoài phạm vi định danh.
- Trình duyệt chạy bộ xử lý lấy từ ứng viên với API giả lập và dữ liệu không phải khách thật: lỗi rồi bấm đọc lại thành công; dừng rồi đọc lại thành công; cả ba tab nhận thông tin; QR nhỏ trong ảnh 1.400 × 1.800 được giải mã. Đây là môi trường kiểm tra riêng, không phải giao dịch POS thật.
- POS đóng trước cài, mở lại lúc 21:39:13 giờ Việt Nam. Kiểm tra Remote thật: hai tệp QR trả HTTP 200 đúng kiểu JavaScript, yêu cầu tệp cấu hình qua đường tài nguyên trả HTTP 404.
- Chưa quét lại bằng iPhone thật hoặc căn cước khách thật sau cài; chưa đo thời gian/độ chính xác Gemini trên ảnh khách trong lượt này.

## Cài đặt và hoàn tác

Gói đang chạy: `D:/KBL/POS/KimBaoLam_POS_TichHop_20260818/dist/win-unpacked/resources/app.asar`.

- Trước: `4b66e4f5fbf8a5bf24a6911b66bddce71c978db05ae1bd8b56744d2708c07e8b`.
- Sau: `fbe8cf3b074dd6eafd22bb0e5dec4ecd27eb53f4fff9a0587c3c5ce829040d17`.

Gói giữ nguyên toàn bộ payload gốc và các mục ngoài phạm vi. Đã kiểm tra tái dựng ra đúng mã SHA-256 gói trước. Bản nguồn đang bảo trì được vá riêng từ bản đã loại khóa bí mật; không nhập tệp riêng tư từ máy đang cài vào Git.

Hoàn tác cục bộ: thoát POS bình thường, dùng `work/install-identity-recovery.py --rollback` trong workspace của lượt sửa. Trình cài chỉ chấp nhận đúng mã gói đã biết và kiểm tra POS đã thoát. Giữ các tệp hoàn tác cho đến khi thử điện thoại thật đạt; không cần giữ thêm một bản ASAR nguyên khối trong thư mục làm việc sau khi đã xác nhận cài đúng.

Sau cập nhật, điện thoại tải lại trang Remote rồi thử ảnh/QR. Khi lỗi, dùng nút Đọc lại trên POS; không cần gửi lại cùng ảnh chỉ vì API phản hồi chậm.

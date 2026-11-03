# Vàng của tôi

Truy cập `/vang-cua-toi`, đăng nhập khách hàng bằng luồng sẵn có. Thêm lần mua/bán: loại vàng, chỉ (tối đa 3 số lẻ), tổng VND thực trả/nhận và ngày. Mua cùng loại được gộp vốn bình quân; bán bớt giảm lượng/vốn tương ứng. Sửa/xóa được nếu không làm số vàng âm ở một ngày sau đó. Cùng ngày giữ thứ tự nhập vì chưa có giờ giao dịch. Có số vàng còn giữ, giá trị theo giá tiệm mua vào, vốn còn giữ, lãi/lỗ đã bán và lãi/lỗ tạm tính cùng %.

Giao diện mẫu 06, mũi tên ↗/↘/→ biểu thị lãi/lỗ so với vốn còn giữ (không phải biến động trong ngày). Đường zigzag theo các mốc giá thật lịch sử tiệm; dưới hai mốc thì ghi chưa đủ dữ liệu. Giá hiện tại thiếu loại/đơn vị hợp lệ không tính tổng giả. Sổ do khách nhập, không xác nhận giao dịch hay vàng đang gửi tại tiệm; tiền công/đá/hao hụt/điều kiện thu mua thực tế có thể khiến kết quả khác.

Widget Scriptable riêng `KBL Vang Cua Toi`: sao chép mã đã kiểm tra hash trên trang, dán vào editor mới và lưu. Tạo mã ghép một lần trên website, chạy ▶ script trong ứng dụng và dán mã vào hộp hỏi. Thêm Scriptable widget ra màn hình → Sửa tiện ích → Script → chọn **KBL Vang Cua Toi**. Đủ nhỏ/vừa/lớn; Parameter `ẩn` che số liệu. Đổi tài khoản bằng chạy script → Ghép lại. Trang có nút thu hồi. Keychain lưu token; không dùng mật khẩu đăng nhập trong script. Không tự chạy mã tải từ mạng. Widget bảng giá cũ vẫn riêng.

Giới hạn: iOS quyết định thời điểm cập nhật, không từng giây; mất mạng hiển thị chưa kết nối và không dùng file cache tài sản. Quyền bị thu hồi/đổi mật khẩu/hết 90 ngày yêu cầu ghép lại. Ảnh widget đã hiện có thể còn trên iOS đến lần cập nhật; website không xóa được ảnh đó từ xa.

Không thêm dependency, schema/migration hay thay POS/auth/Cloudflare. Chạy `node scripts/build-kbl-holdings.mjs` sau khi sửa template/core rồi build Cloudflare như thường. Dùng bảng records và secret tài khoản khách đã cấu hình sẵn. Nếu tài khoản khách chưa hoạt động, cần cấu hình auth hiện có; không bỏ đăng nhập để hiển thị tài sản.

Kiểm tra tự động: `node --test tests/holdings.test.mjs tests/holdings-widget.test.mjs`. API test dùng SQLite thật và code API bundle thật với D1 adapter giả lập; VM thực thi file Scriptable sinh ra cho cả ba cỡ. Browser kiểm tra module trang thật với API fixture ở harness ngoài repo, có nhãn dữ liệu giả lập; đây không phải browser production hoặc dữ liệu khách thật. iPhone thật, Keychain giữa widget/app, Safari clipboard/pairing và production deployment chưa nghiệm thu trong môi trường này.

# POS liên 2 và bố cục đổi vàng — kiểm tra trực tiếp03/11

Chủ tiệm báo bộ cập nhật hôm trước lỗi, chưa thấy thay đổi. Không đổi công thức, giá, phép tính, phiếu đã chốt hoặc dữ liệu nghiệp vụ.

## Kiểm tra thực tế

- Chọn đúng cửa sổ POS chạy từ `dist/win-unpacked` tại thư mục đã được chủ chỉ định. Phiên hiện tại mở08:29 ngày03/11, sau lần cài hai tệp trình bày07:59. Đọc lại `pawn.html` và `kbl-jewel-ui.js` trong app.asar, khớp source đã cài.
- Mẫu lưu cục bộ thực có dòng cũ LS1,66% ở liên2. Đã đọc riêng cấu trúc mẫu, loại dữ liệu cá nhân khỏi bản tái hiện; không mở database để ghi và không viết lại localStorage.
- Trên cửa sổ Cầm đồ đang mở, dòng lãi/phí của cả hai liên hiện là LS1,5%; với biểu mẫu gốc trống, các phí0,5/0,5/0,5. Không nhập khoản vay giả, không lưu hoặc in phiếu. Ngưỡng100/120triệu và lịch sử đã chốt tiếp tục được kiểm tra bằng bộ kiểm thử source.
- Kiểm tra thực hai chế độ Đổi Vàng Bù/Đổi Ngang KBL khi giỏ trống. Thứ tự bên trái: CCCD → giỏ vàng cũ → giá/công/khách → giỏ mới/thanh toán → tìm sản phẩm và thông tin món. Khung nhập vàng cũ ở cột phải, ngay dưới khung xem trước hóa đơn.
- Đã trở về Bán Hàng Mới sau kiểm tra; không bấm xác nhận thanh toán, lưu phiếu, in hoặc sửa/xóa bản ghi.

## Sửa source bàn giao

Tệp `pos-source/kbl-jewel-ui.js` trong source bàn giao còn bản compact cũ, trong khi `windows/pos-compact-runtime.js` và POS đã cài có phần dàn đổi vàng mới. Đã đồng bộ riêng module trình bày từ đúng bản đã cài, giữ nguyên prefix trình bày khác và mọi tệp nghiệp vụ. Bổ sung kiểm tra gói POS phải chứa cùng module với runtime được bảo trì, tránh source đóng gói khôi phục bố cục cũ. Không cài lại hoặc đóng cưỡng bức POS trong lượt này.

11 kiểm thử source POS/lãi cầm đồ đạt. Bằng chứng ảnh màn hình thực lưu ngoài Git trong outputs; không đưa ảnh căn cước hoặc mẫu in riêng của khách vào source bàn giao. Chưa xác nhận bản in giấy thật.

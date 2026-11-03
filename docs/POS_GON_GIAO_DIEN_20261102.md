# POS — làm gọn giao diện ngày 02/11/2026

- Bỏ thanh nhảy mục ở Thu mua, Bán hàng và Cầm đồ; giữ một nút “↑ Đầu trang” nhỏ ở góc phải. Nút của POS cũng đưa phần Cầm đồ nhúng về đầu.
- Đưa hướng dẫn và ghép hồ sơ đổi vàng xuống dưới mục 4–5, thành ô số 6 thu gọn. Tiêu đề Đối chiếu thừa được ẩn; trạng thái hồ sơ chuyển vào mục chọn phiếu.
- Ẩn đầu trang thừa ở Cầm đồ và Chuộc mất giấy. Các tùy chọn phiếu cầm, gồm Đồng bộ chữ sang Liên 2 và lệnh xem/in, vẫn có trong “Tùy chọn phiếu”. Trạng thái mất giấy vẫn hiện ở ô thông tin phiếu.
- Đưa In tem sản phẩm và Cài đặt tem xuống dưới bảng kho. Tìm kiếm, bộ lọc kho và in tem đã chọn cùng nằm trên một thanh gọn. Giữ nguyên ô số lượng, tọa độ, cấu hình máy in, checkbox và các nút.
- Ẩn các giải thích tĩnh dài được chỉ định, giữ nhãn nhập liệu, trạng thái xử lý, cảnh báo và nội dung chứng từ.
- Tăng thêm 8 mm khoảng cách giữa phần Bảng kê thu mua và Giấy đề nghị bán vàng, cả xem trước và in. Không sửa chữ, số, phép tính hoặc dữ liệu trên phôi.

Chỉ cập nhật phần trình bày trong kbl-jewel-ui.js; toàn bộ phần trình bày cũ giữ nguyên, phần bổ sung được nối ở cuối. Tám file main.js, renderer.js, index.html, pawn.html, shared-scale.js, kbl-connection.cjs, kbl-report-dashboard.js và kbl-galaxy-v2.css giữ nguyên hash qua lần cài này. Có bản sao trước khi cài. Không mở hoặc ghi các file dữ liệu POS, không ép tải lại phiên đang dùng.

Đã kiểm tra bằng bản HTML ngoại tuyến, dữ liệu mẫu, không nạp các script nghiệp vụ hoặc dữ liệu thật: 209 ô nhập/chọn giữ giá trị, trạng thái và thuộc tính; 111 nút giữ nguyên phần xử lý. Kiểm tra lại sau khi mô phỏng dựng lại bộ lọc kho vẫn đạt, không trùng ID. Hai mục hướng dẫn/ghép hồ sơ mở được; nút lên đầu trang đưa vị trí cuộn từ 409 về 0.

Phôi được xem với CSS in mô phỏng: bề rộng nội dung 194 mm đúng lề A4 đang dùng, nội dung mẫu cao khoảng 234 mm trong vùng cho phép 281 mm. Chưa in máy thật. Ảnh đính kèm là bản kiểm tra có dữ liệu mẫu, không phải sổ giao dịch thực.

Mở lại POS sau khi hoàn tất thao tác đang làm để nhận bố cục mới.

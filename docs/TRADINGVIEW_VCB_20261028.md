# Biểu đồ TradingView và tỷ giá Vietcombank

Tab Vàng thế giới dùng widget Advanced Chart chính thức, OANDA:XAUUSD. Ô giá ở trang chủ dùng Single Quote cùng mã nguồn. Không vẽ dữ liệu giavang.org rồi gắn nhãn TradingView. Lịch sử giá tiệm mốc13 giờ giữ nguyên; dữ liệu world cũ không xóa và không mạo nhận là feed TradingView.

GET /api/public/fx đọc độc lập XML USD Sell của Vietcombank, cache60s, backoff lỗi30s, bản lưu tối đa6h có nhãn stale. Nguồn vàng gián đoạn không làm đóng băng lần cập nhật FX thành công. Widget không cung cấp quote ra API theo tài liệu TradingView (https://www.tradingview.com/widget-docs/faq/data/). Vì vậy UI không giả có quy đổi tự động từ widget. Có ô nhập giá XAU/USD đang xem để tính theo USD Sell VCB; chỉ tính khi FX khả dụng và chưa stale, ghi rõ người xem nhập giá. Công thức ounce troy31.1034768g, chỉ3.75g, lượng37.5g; không đổi công thức hay giá POS.

Để có chuyển đổi tự động từ một feed số tương ứng TradingView cần nguồn dữ liệu được phép, có tài liệu/khóa/quyền sử dụng; chưa có nguồn đó thì không âm thầm thay bằng dữ liệu giavang.org hoặc USDVND từ một broker khác. Không lấy websocket/API nội bộ của TradingView, không đọc lén iframe.

Kiểm thử: 154 tests, TypeScript và build Cloudflare; gồm FX độc lập, cache/stale/expiry, đơn vị quy đổi và widget không mạo danh nguồn cũ. Chưa xác minh widget thật render trên TV/Chrome người dùng hoặc quyền truy cập dữ liệu thị trường của tài khoản. Không tuyên bố giá tick-by-tick chỉ vì nhúng widget.

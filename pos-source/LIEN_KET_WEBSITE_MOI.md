# POS đầy đủ source và kết nối website mới

Bộ nguồn ghép từ full source POS 2.4.4 và sáu file mới nhất người dùng gửi. Không kèm database, ảnh sản phẩm, thông tin khách, token hoặc file settings vận hành. Cài/kiểm tra trên bản sao trước khi thay bản POS đang bán hàng; sao lưu dữ liệu riêng trước.

## Chạy source

Cài Node.js, chạy `npm install` trong thư mục POS; `npm run check`; `npm start` để mở Electron. `npm run dist` dựng bản Windows portable. Bộ này chưa kèm EXE đã ký hoặc đã kiểm tra trên máy bán hàng thật. Các file CSS/JS hỗ trợ lấy nguyên từ gói full source, không tạo hàm giả để lấp chỗ thiếu.

Trong Cài đặt & AI → Đồng bộ website: URL `http://127.0.0.1:39878`, mã đồng bộ local lấy từ worker Windows mới. Bấm lưu. Bộ nối mới lưu riêng đúng hai giá trị kết nối vào `%LOCALAPPDATA%\KBL-New\pos-link.json`; không bị các thư mục mirror của POS cũ đổi về tên miền cũ. Chỉ URL HTTPS gốc hoặc loopback chính xác được chấp nhận, không nhận đường dẫn/query/user/password trong URL.

Không dùng URL local làm miền QR của khách: QR công khai tiếp tục dùng tên miền website, sau khi người dùng trỏ miền sang Cloudflare. Mã local không phải mã đăng nhập AI/OAuth/worker cloud. Bộ kết nối chỉ gửi dữ liệu POS đã lọc tới worker; website không sửa ngược công thức, phiếu hoặc kho.

Chọn thư mục data thật ở trang worker để đọc ảnh nén product-photos và đọc kho/giá ngay cả khi POST chưa hoạt động. Phiếu cầm/bảo hành cần POS gửi riêng. Chỉ coi hoàn tất khi website có biên nhận thật và QR đúng số liệu POS.

## Phạm vi thay đổi và giữ công thức

`main.js`, `renderer.js`: chỉ sửa phần đọc/lưu/kiểm tra địa chỉ và token đồng bộ. Thêm `kbl-connection.cjs`. Các phép tính giá, khối lượng, đổi bù, doanh thu, lãi cầm và in phiếu giữ nguyên. Đã đối chiếu đảo ngược patch kết nối để khớp byte nguồn mới nhất; hash nguồn và hash phân phối nằm trong LATEST_SOURCE_PROVENANCE.json. Đã bỏ credential relay cũ nhúng trong renderer/index; người dùng cấu hình credential mới khi cần.

`kbl-product-photos.cjs`, `package.json` giữ nguyên byte mới nhất; pawn/index chỉ bỏ thẻ gọi addon chưa nhận, các hàm inline giữ nguyên. `shared-scale.js` và các file phụ lấy từ full source đã cung cấp.

## Tài nguyên chưa nhận được

Bốn tham chiếu có trong sáu file mới nhất nhưng không có trong full source hay local worker đã nhận: `kbl-galaxy-v2.css`, `kbl-report-dashboard.js`, `kbl-header-prices.js`, `kbl-pawn-recovery.js`. Đã bỏ chính xác các thẻ gọi addon thiếu khỏi bản phân phối, ghi từng thẻ trong manifest; không chèn file rỗng giả làm đầy đủ. Phần theme Kim Sắc/kim hoàn nền, renderer, giá, bán hàng và pawn gốc vẫn có; không khẳng định các hiệu ứng/báo cáo/recovery bổ sung của bốn file đó đã phục hồi. Các script kiểm tra release thương mại cũ trong scripts dùng hash của bản cũ, không đại diện nguồn latest này; kiểm tra bản ghép bằng npm run check và bộ tests/pos-source.test.mjs ở website source.

Để giữ POS đang chạy ổn, có thể chỉ dùng worker đọc data và giữ nguyên bản POS hiện tại. Chỉ thay code POS khi đã kiểm tra trên bản sao với người dùng.

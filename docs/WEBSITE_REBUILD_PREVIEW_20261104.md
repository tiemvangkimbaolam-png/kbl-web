# Bản thử website Kim Bảo Lâm — 04/11/2026

Đã thực hiện phương án KBL_PHUONG_AN_WEBSITE_20261103.md trên bản thử. Website chính chưa phát hành phiên bản này. Giữ trắng ngà–đồng, chữ số dễ đọc; thứ tự đầu trang → giá → trang sức → dịch vụ → liên hệ được dựng ngay từ HTML server, không chuyển khối DOM sau tải. Bỏ màn chào3.5giây và CSS/controller cũ khỏi đường tải trang chủ; không xóa các URL/chức năng đang dùng.

Biểu đồ/lịch sử, AI, thử trang sức, góp ý và chi tiết mẫu tải khi mở. Chat đã mở được giữ sau khi đóng khung để không mất câu hỏi đang chờ. Còn tìm mã, giỏ giữ mẫu, yêu thích/so sánh/chia sẻ, liên hệ Zalo kèm đúng SKU/URL, tài khoản, tra cứu, widget, Vàng của tôi và các chính sách. Trang chủ không tải font rời hoặc TradingView trước khi khách mở tiện ích; đã kiểm tra network trong Lighthouse.

Ước tính cầm đồ **chỉ trên web**: <=100triệu tổng3%/30ngày, >100triệu2.5%; LS1.5%, PTĐ/PĐQ/CPBG=.5/.5/.5 hoặc.4/.3/.3%. Bao gồm ngày nhận cầm. Đúng100triệu30ngày trả3triệu;100000001đ trả2500000đ. Trình bày kết quả là lãi/phí ước tính; phiếu tại tiệm xác nhận thực tế. Không chỉnh công thức hoặc hồ sơ POS.

## Hình ảnh cần bổ sung

Bản đọc công khai có377món, một mã có ảnh; kho ảnh POS cũng chỉ có một mã trong chỉ mục (hai tệp gồm bản gốc và JPEG). KBL-KA96VM được chủ xác nhận là Nhẫn, nhưng ảnh đang gắn là dây chuyền. Không tự đổi tên, giá, trọng lượng, SKU hay chuyển ảnh sang món khác. Khu nổi bật chỉ hiện món được chọn trưng bày và có ảnh liên kết; hiện chưa có món đạt cả hai điều kiện. Các mã vẫn tra cứu được. Cần ảnh nhẫn đúng mã hoặc chủ chỉ rõ ánh xạ trước khi trưng bày; ảnh/record gốc không bị xóa. Không thể khẳng định mọi ảnh đã đối chiếu khi chưa có ảnh đúng.

## Kiểm chứng

- 382/382 kiểm tra đạt, gồm giữ giá/thời điểm khi mất mạng và khôi phục, ngưỡng cầm đồ, đơn vị, bộ đệm và các luồng worker/API cũ.
- Build Cloudflare đạt; kiểm tra TypeScript phần web đạt. Kiểm tra toàn repo còn lỗi có sẵn TS2558 ở windows/remotion/src/Root.tsx:7 (Composition cần2type argument); không sửa mô-đun video. Đây không phải lỗi build web.
- Trình duyệt kiểm tra320/360/390/768/1440px: không tràn ngang, không cắt ô giá; thứ tự section đúng. Mở/đóng menu, modal, tìm KBL-KS3P4B, giá/giỏ tăng giảm, đo15.6mm→Ni9, ước tính hai ngưỡng đạt. Thử ảnh dừng ở yêu cầu đăng nhập; không gửi ảnh khách hay tạo ảnh/đơn thật.
- Lỗi503 cho API giá/danh mục được tạo **chỉ trên proxy thử**: bảng giá và thời điểm nguồn còn nguyên; có cảnh báo bản lưu. Kết nối lại hết lỗi, không biến giá thành0.
- POS, windows/worker, API/lib, bindings, migrations và bộ điều phối có diff rỗng so với mốc trước lượt sửa; không ghi dữ liệu production, không đổi Cloudflare/DNS/luồng đăng.

## Đo Lighthouse cục bộ

Chrome mới/hồ sơ tạm riêng; Lighthouse13.6.0, simulated mobile/desktop, ba lượt mỗi nhóm; dữ liệu công khai chụp lúc08:27, nguồn thời gian hiển thị nguyên trạng và được đánh dấu cũ. Đây là số đolocalhost, **không phải PageSpeed tên miền thật**, không suy ra Core Web Vitals người dùng thực hay cam kết doanh thu.

| Trang / khung | Hiệu năng (trung vị; khoảng) | Trợ năng | LCP trung vị; khoảng | CLS |
|---|---:|---:|---:|---:|
|Trang chủ · mobile|100 (100–100)|100|1.230s (1.219–1.233)|0.0000|
|Trang chủ · desktop|100 (100–100)|100|0.301s (0.297–0.303)|0.0000|
|Bảng giá · mobile|100 (100–100)|100|0.920s (0.919–0.921)|0.0016|
|Chi tiết KBL-KS3P4B · mobile|100 (100–100)|100|0.922s (0.922–0.923)|0.0026|

Điểm38/60 trong video02/11 là lịch sử, không so trực tiếp vớilocalhost. Chưa đo lại tên miền chính trên phiên bản mới vì chưa phát hành. Chưa thử iPhone/Android vật lý hoặc đủ dữ liệuINP/p75; owner xem bản thử trước khi phát hành theo yêu cầu đã chốt.

## Xem bản thử

- Máy tính: http://127.0.0.1:18747/
- Điện thoại cùngWi-Fi với máyPOS: http://192.168.1.9:18747/ (chưa xác nhận từ điện thoại thật; không đổi firewall). Cần máy tính đang mở bản thử.
- Bản thử dùngDB cục bộ chỉ chứa bản sao danh mục/giá công khai, không sao chép khách hàng, hồ sơ, tài khoản AI, job hoặc token. Proxy chỉGET/HEAD, chặn ghi dữ liệu và routeAdmin/worker. Không dùng để đăng nhập hoặc gửi đơn thật.
- Gói build đang chạy cục bộ, chưa tải lên Cloudflare. Khi chủ duyệt: lưu version hiện tại của Worker, triển khai gói đã kiểm tra **không đổi migrations/bindings**, kiểm tra lại public GET và giá/URL/channels, đo trên tên miền thật; dùng version cũ để rollback nếu có lỗi. Không tự chuyển DNS, reset snapshot hoặc xử lý lại job đang giữ.
- Nguồn sạch và ZIP đầy đủ bàn giao trong workspace. GitHub public vẫn chưa được cho phép đẩy; không đẩy mã ở lượt này.

Ảnh đầu trang: outputs/KBL_WEB_THU_DESKTOP_20261104.jpg và outputs/KBL_WEB_THU_MOBILE_20261104.jpg. Bộ đo đầy đủ12JSON ở work/website-rebuild-20261104/, không đưa caches/DB/cấu hình vận hành vào ZIP.

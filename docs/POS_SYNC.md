# Đồng bộ POS vào website mới

Bổ sung source ngày 26/10/2026; chưa triển khai lên web, chưa đổi DNS. Sáu file POS đã đủ để ghép phần giá, kho/ảnh, phiếu cầm và bảo hành. Không cần gửi database, settings.json hoặc khóa lúc này.

## Nguồn đã đối chiếu

| File | Phần sử dụng |
|---|---|
| main.js | IPC và các POST đồng bộ Electron đang có |
| renderer.js | Giá, kho, trạng thái bán/trả, payload bảo hành |
| pawn.html | pawnSyncSafeRecord, số lãi/phí POS đã tính, token QR |
| kbl-product-photos.cjs | product-photos/index.json và JPEG theo hash/SKU |
| index.html | Các tab và cài đặt kết nối hiện có |
| package.json | Electron/Node và cấu trúc ứng dụng |

Không sửa sáu file gốc, công thức bán/cầm/đối chiếu hoặc dữ liệu POS. Hash nguồn ở POS_SOURCE_REFERENCE.json. Worker không thực thi module POS.

## Luồng đã làm

POS gửi qua chức năng đồng bộ có sẵn đến relay loopback của worker Windows mới. Relay lọc trường, lưu hàng đợi SQLite riêng và gửi HTTPS có quyền worker đến website. Website không ghi ngược POS.

| Dữ liệu | Quy tắc |
|---|---|
| Giá | Đọc price_buy/price_sell do POS xuất; đồng/chỉ; ghi thời điểm nhận |
| Kho | Snapshot đầy đủ, tối đa 500 dòng; chỉ Đang bán hiển thị; webSyncReady=false giữ tại POS; dòng thiếu bị ẩn |
| Giá món | Đúng biểu thức xem trước POS: Math.round(weightLy/100 × giá/chỉ + công); chưa gồm chiết khấu riêng; thiếu giá/chỉ để báo giá |
| Ảnh | Chỉ JPEG nén trong product-photos, SHA và SKU phải khớp; không đọc original; không xóa khi dọn video |
| Phiếu cầm | Snapshot/delta từ pawnSyncSafeRecord; giữ nguyên số lãi/phí/tổng POS gửi; không tính lại |
| Bảo hành | Mỗi hóa đơn/SKU một QR ổn định; gửi lại không cấp trùng; nội dung mâu thuẫn bị từ chối |
| Bán/trả/xóa | Tạm ẩn SKU liên quan; chỉ snapshot kho mới quyết định còn bán; phiếu bảo hành trả/hủy ghi trạng thái |

Sau khi ghép, Admin khóa sửa tay giá/danh mục/ảnh; nguồn Windows thứ hai không được ghi đè. Một phiếu lỗi không chặn đồng bộ giá/kho. QR/token trùng hoặc vượt hạn mức không áp dụng bản chụp một phần.

## Cấu hình khi chọn xong hosting

1. Triển khai website mới với các migration drizzle theo thứ tự, DB/BUCKET và quyền chủ/worker. Không chép source này đè lên Tenten cũ.
2. Dùng thư mục windows mới, tải kbl-config.json riêng từ Admin mới đặt cạnh KBL_WINDOWS.cjs. Chạy BAT_DAU.cmd; mở http://127.0.0.1:39878/ trên chính máy POS.
3. Bấm **Lấy cấu hình POS trên máy này**. Trong POS → Cài đặt → Đồng bộ website, nhập URL http://127.0.0.1:39878 và mã local vừa lấy. Đây chỉ là cài đặt kết nối. Không đưa mã vào Git hoặc dùng thay token worker.
4. Kiểm tra đường dẫn data có settings.json, inventory_db.json và product-photos. Mặc định KBL_POS_DATA_DIR hoặc KimBaoLam_POS_TichHop/data trong APPDATA. Nếu khác, nhập đúng thư mục data ở trang local và lưu. Worker không ghi vào đó.
5. Đồng bộ giá/kho từ POS; mở tab Cầm đồ để POS xuất snapshot. Sau yêu cầu hợp lệ đầu tiên, relay tự đọc giá/kho mỗi phút và kiểm tra ảnh mỗi 15 giây, tối đa 5 ảnh mới mỗi lượt.
6. Admin mới → Kết nối xem thời gian nhận, số dòng, việc/ảnh chờ và lỗi. Quét QR phiếu thử để đối chiếu số tiền POS, SKU và ảnh trước khi trỏ tên miền cũ.

Giữ worker chạy. Mất mạng báo chưa thành công, việc vẫn lưu ở Windows để gửi lại. Main.js gốc coi mọi HTTP 2xx là thành công nên relay dùng HTTP 503 khi website chưa xác nhận, không trả 202 để đánh dấu xong giả.

## QR và dữ liệu riêng

- Phiếu cầm giữ publicToken POS cấp; /tra-cuu?token=... tiếp tục được hỗ trợ sau khi tên miền cũ trỏ sang web mới. Mã phiếu hoặc điện thoại riêng lẻ không đủ quyền tra cứu.
- POS phải mở để gửi phiếu cầm. Worker không đọc localStorage/Chrome hoặc tính lại lãi; dữ liệu quá 30 phút được ghi cũ và cần đối chiếu cửa hàng.
- Bảo hành đọc đúng warrantySnapshot của hóa đơn trong sales_db.json để phục hồi token cũ nếu còn lưu ở POS. Không gửi toàn bộ hóa đơn. Nếu POS không có token cũ, không thể khôi phục QR đã mất trên server chỉ bằng code.
- Không gửi CCCD/ảnh CCCD, địa chỉ khách, giá vốn hoặc lợi nhuận. Tên/điện thoại và số tiền phiếu chỉ được trả qua QR bảo mật; không có danh sách phiếu công khai.
- Bản xem trước hiện riêng tư; QR chưa phải dịch vụ khách hàng công khai. Mở public sau khi chốt hosting và kiểm tra quyền.

## Hạn mức và phần còn lại

Kho 500 dòng; phiếu cầm 500 dòng/lần, tối đa 20.000 bản ghi; bảo hành 20.000; outbox Windows 100 việc/16MiB; JPEG POS tối đa 8MiB. Kho ảnh website mặc định 256MiB có chặn đầy, không tự xóa ảnh sản phẩm.

Loyalty/VIP, cloud-price-config Google relay và đối chiếu giao dịch hàng loạt chưa chuyển sang backend mới; endpoint báo chưa hỗ trợ, không xác nhận giả. Phép tính và lưu cục bộ POS giữ nguyên. Các token mạng xã hội/API từ server cũ chưa được khôi phục chỉ từ source.

26 bài kiểm thử dùng schema từ code thật với fixture, SQLite thật và D1/R2 giả lập. TypeScript và build được kiểm tra. Chưa chạy trên POS/Windows thật của người dùng; không dùng kết quả mô phỏng để khẳng định đã đồng bộ hay đăng tin thật.

## Khi POS tự đưa URL về tên miền cũ

Không sửa công thức hoặc ép URL trong POS. Trên trang Windows local, lưu đúng thư mục data có settings.json và inventory_db.json: thao tác này bật đọc chỉ đọc giá/kho/ảnh ngay, không cần POS gửi HTTP lần đầu. Việc đọc tiếp tục khi đóng trang cấu hình nếu worker còn chạy. Đường dẫn không hợp lệ không được lưu. Phiếu cầm/bảo hành và giao dịch tức thời vẫn cần kết nối POST của POS; đọc kho không có nghĩa các phiếu đã được đồng bộ.

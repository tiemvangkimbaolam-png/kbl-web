# Giá POS, giá thế giới và nhịp đọc D1 — 02/11/2026

## Hành vi sau cập nhật

- Giá tiệm của website, TV, sổ vàng và widget vẫn chọn cùng `readShopPrices()`: ưu tiên snapshot POS còn mới; nguồn Google BK/ASK dự phòng dùng đúng mức cộng và chênh lệch đã được POS bàn giao. Không đổi công thức, không lấy XAU/USD thay giá tiệm, không gắn giờ mới cho giá cũ.
- Trang chủ lấy JSON giá mỗi 15 giây khi đang xem; danh mục mỗi 5 phút. Nút làm mới vẫn lấy lại danh mục. Cache giá công khai tối đa 5 giây, danh mục 30 giây, mẫu TV 60 giây tại từng điểm Cloudflare. Các con số này là nhịp kiểm tra, không phải cam kết nguồn thay giá từng giây.
- Trang `/bang-gia` render từ loader chỉ có giá, cả lần đầu lẫn khi tải lại. TV và editor dùng JSON giá có thông tin tiệm, không tải sản phẩm. TV lấy giá thế giới riêng mỗi phút từ `/api/public/market`, kèm giờ nguồn/giờ đọc và trạng thái khi nguồn lỗi. Endpoint thị trường không đọc D1; lịch sử thế giới vẫn ghi một điểm thật mỗi 5 phút.
- Cache công khai chỉ nhận các khóa cố định. Không cache Admin, session, mục tiêu, số vàng, token hoặc dữ liệu riêng của khách. Mục tiêu đã ghép vẫn đọc API riêng, giữ `no-store`; iOS quyết định lịch làm mới widget.
- Admin yêu cầu đúng nhóm dữ liệu theo màn hình và quét mỗi 30 giây khi đang hiển thị; riêng màn lưu trữ mỗi 5 phút, vẫn có làm mới thủ công. Trang kết nối không đọc cả kho, lịch sử công việc hay tổng dung lượng. API không có `view` giữ hợp đồng đầy đủ cho bản cũ.
- Windows 2.2.1 dùng lại thư mục POS chủ đã chọn. Không cần ghép lại khi chỉ khởi động lại, đổi tên miền nhưng giữ danh tính worker hoặc mất mạng. Giá kiểm tra mỗi phút; kho/cấu hình đã có biên nhận chỉ gửi lại khi dữ liệu đổi hoặc đổi danh tính backend. Giá đổi làm đổi giá sản phẩm thì vẫn gửi kho cần thiết. Hàng đợi và biên nhận giữ qua khởi động lại.
- Hàng đợi AI mới chỉ đọc trạng thái còn hoạt động, cộng các job worker đang giữ để đối soát ACK đến muộn. Khi rảnh/lỗi mạng, kiểm tra lại sau 60 giây; khi có việc, 15 giây. API hàng đợi cũ vẫn tương thích và có index thứ tự.
- Sửa lịch AI lưu bị giá trị mặc định ghi đè. Chỉ chuyển bước còn thiếu, có dấu biên nhận theo `attempt:result_hash`; việc đã hoàn tất không bị quét lại toàn lịch sử. Giữ lease, duyệt độc lập, trạng thái chưa rõ và chống gửi trùng.
- Giá nguồn, AI, inbox, feedback, lịch sử và cảnh báo chạy độc lập trong cron mỗi phút. Lỗi một nhóm không chặn nhóm khác. Dọn nhật ký/bộ đếm/phiên/lịch sử hết hạn và video đủ biên nhận chạy mỗi giờ. Không xóa ảnh sản phẩm đang dùng hay tự bật đăng công khai.

## Đo cục bộ, không phải số tiền hoặc lưu lượng production

Chạy `node scripts/measure-d1-budget.cjs` tại repo đã cài dependencies. Script tạo D1 Miniflare riêng với dữ liệu giả, không mở tài khoản hay database thật. Cột trước đã áp dụng index 0003 của bản trước; cột sau thêm 0004 và nhịp mới. Cột mỗi ngày nhân nhịp nguồn trước/sau, giả định đủ 24 giờ; production sẽ bị chặn nếu chạm quota, không thể thực đọc vượt trần Free.

| Việc và dữ liệu giả | Trước: dòng/ngày | Sau: dòng/ngày |
| --- | ---: | ---: |
| Dọn nhật ký, 2.000 dòng còn giữ | 5.760.000 | 48.024 |
| Dọn 8.640 điểm thế giới chưa hết hạn | 1.440 | 24 |
| Kiểm tra 1.000 mốc cảnh báo đã tắt/xong | 1.441.440 | 0 |
| Kiểm tra 1.000 thông báo đã hoàn tất | 1.441.440 | 0 |
| Một màn Admin AI mở 24 giờ, 1.000 job, trả 250 | 11.520.000 | 720.000 |
| Một Windows rảnh, 1.000 job đã xong | 11.520.000 | 10.080 |
| Tìm bước chưa chuyển, 1.000 job đã có biên nhận | 2.880.000 | 1.440 |

Không cộng bảng này thành dự báo tổng sử dụng thực tế: đây là các phép đo truy vấn riêng với fixture. Không bao gồm lượt đọc khác, request khách, job đang hoạt động, ghi dữ liệu hoặc lượt tạo index một lần. Cache phụ thuộc từng điểm Cloudflare và có thể bị loại sớm. Free không được bảo đảm vô hạn; cần xem D1 Metrics/Insights sau khi cập nhật để đối chiếu lượng đọc/ghi thực tế.

## Áp dụng lên đúng dự án

1. Lấy branch `kbl-web-moi` mới. Giữ nguyên cấu hình bí mật và dữ liệu của chủ.
2. Trên máy đã đăng nhập Cloudflare, chạy `CLOUDFLARE_2_TRIEN_KHAI.cmd` tại repo. Helper build, áp dụng migration **0003 + 0004 còn thiếu** rồi triển khai đúng `kbl-web-moi` / `kbl-web-moi-db`; không động vào `kbl-backup`. Migration 0004 thêm cột metadata và index, backfill dấu chuyển bước từ biên nhận đã có. Không sửa migration cũ.
3. Nếu dùng Cloudflare Git builds, lệnh deploy phải là `npm run deploy:cloudflare` sau build; chỉ `wrangler deploy` không tự áp dụng D1 migrations. Không triển khai code mới trước migration. Giữ cấu hình resource trong `wrangler.cloudflare.json`.
4. Tải bộ Windows mới ở `/downloads/KBL-WINDOWS-2.zip`, giải nén đè vào đúng thư mục bộ đang dùng có `kbl-config.json`. Gói không chứa config thật. Chạy **CAP_NHAT_AUTODANG.cmd** một lần: script thay tiến trình KBL trong chính thư mục đó, xác minh health 2.2.1 và bật tự chạy khi người dùng Windows đăng nhập. Giữ thư mục này cố định. Không ghép lại, không thay hồ sơ Chrome hay dữ liệu POS.
5. Trong Admin → Kết nối xem heartbeat, POS pending/lastError và nguồn cloud. Nếu chưa từng chọn thư mục POS thì phải chọn đúng `data` một lần. Nếu khóa mã hóa server chưa có, dùng nút/hướng dẫn hiện có; không đưa khóa hay token vào Git/chat. Kết nối AI vẫn cần tài khoản thực đã ghép, quyền và cài đặt tự động đã bật.

## Bằng chứng và phần chưa thể xác minh

Bộ test dùng API ứng dụng thật, SQLite, D1 Miniflare, transport/hook giả và FFmpeg fixture. Browser QA dùng component TV thật với giá giả ở môi trường xem thử; không đưa giá thử lên website. Test gồm lưu lịch, cache/riêng tư, SSR chỉ giá, đua phản hồi danh mục/giá, khởi động lại, mất mạng/ACK, tránh gửi kho không đổi và chuyển bước theo biên nhận.

Kiểm tra TypeScript toàn repo vẫn có lỗi đã tồn tại ở `social-connections.currentUrl` và dependencies Remotion của Windows; không ghi nhận kiểm tra này là pass. Build Cloudflare và các test runtime nêu trên pass.

Trong phiên bảo trì, API production trả HTTP 200, giá tiệm `cloud-shop` còn mới và giá thế giới available=true. Điều đó xác nhận nguồn ở thời điểm đọc, không chứng minh bản sửa này đã triển khai. Wrangler của môi trường bảo trì chưa đăng nhập Cloudflare; không có quyền chạy trực tiếp máy POS Windows/iPhone/TV hay dùng tài khoản AI thật. Không gửi push/đăng bài/tạo ảnh thật trong QA. Chỉ xác nhận vận hành 24/24 sau khi áp dụng source + migration + bộ Windows và kiểm tra thiết bị thực.

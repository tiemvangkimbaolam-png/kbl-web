# Khôi phục KBL trên Cloudflare

Mục tiêu: website trên Cloudflare, POS là nguồn chỉ đọc, Windows chạy đội Chrome miễn phí và dựng video; giữ ảnh sản phẩm/bài viết, chỉ dọn video tạm khi đủ biên nhận. Không thay công thức hay dữ liệu POS.

## Mốc đã lưu

- Source gốc đã xác minh trên GitHub: `a36141ee43ed2d751c3f242c225bd1812d30efc4`, nhánh `kbl-web-moi`, repo `tiemvangkimbaolam-png/kbl-web`.
- Bộ sửa của phiên điều phối trước chưa được commit/push trước khi môi trường kết thúc; không xem các báo cáo test cũ là kết quả của checkout hiện tại. Đang khôi phục, chạy lại kiểm tra và lưu theo từng phần.
- Ảnh người dùng cung cấp xác nhận Worker mới nối đúng nhánh, D1 `kbl-web-moi-db` UUID `642e732e-5bc1-42cd-b155-ba6e3eac32dd`, R2 private `kbl-web-moi-media`, Access app `KBL Admin Moi` đã tạo; team `billowing-sunset-1714`. Chưa có AUD hoặc biên nhận triển khai ứng dụng mới.

## Công việc đang xử lý

Mốc API đã lưu lên GitHub: `c43ed2b4757ce4ea5cb259780f1b51767017290e`. Bốn test API/SQLite của checkout hiện tại đạt: probe schema/R2, ảnh muộn đúng lease, retry có xác nhận và audit, cron vẫn dọn độc lập khi tick lỗi.

Đã kiểm tra riêng phần UI: 5 test Node, TypeScript toàn source và diff check đạt. Đã kiểm tra riêng phần Windows: 5 test; gồm bridge/hub/SQLite thật trong fixture, restart sau cảnh đầu, ACK mất, lease local cũ, CommonJS và FFmpeg dựng MP4 dọc 1080×1920 với audio tổng hợp. Không phải phiên Windows/Chrome/TTS thật. Chờ chạy gộp sau khi phần POS và pipeline hoàn tất.

Phần POS đã qua 13 test riêng, TypeScript, cú pháp relay và diff check: phân biệt ACK theo worker/token; giữ ACK khi chỉ đổi hostname; watermark chung cho tồn kho và sự kiện bán/đổi trả; tối đa 5 lượt thử tải ảnh mỗi vòng và xoay SKU để không bỏ đói. Không sửa POS gốc/công thức. Source và ZIP Windows đang được lưu lên GitHub trước bước kiểm tra gộp.

- Giữ prompt/schema/nonce/lease qua restart; nhận ảnh trả muộn đúng lượt; cache render theo nội dung; khởi động CommonJS Windows đúng.
- Phân phối theo khả năng; thử độc lập các nguồn tin; sửa nội dung/ảnh sau duyệt với lịch sử kết quả, không gửi lại prompt chưa rõ trạng thái.
- Đồng bộ ACK ảnh theo định danh backend; chống giao dịch POS cũ đảo tồn kho mới; giới hạn số lượt tải ảnh lỗi.
- Thêm tài khoản kèm lệnh đăng nhập khi có worker online; hiển thị queued/confirmed chính xác; chỉ hướng dẫn nhập kho/giá qua POS.
- Cron Cloudflare và kiểm tra DB/R2 có thực thi truy vấn thật; kiểm tra toàn bộ trước khi đóng gói.

## Nút chặn triển khai và nghiệm thu

1. Thiếu `CF_ACCESS_AUD` của chính ứng dụng Access `KBL Admin Moi`; không tự bịa hoặc bỏ xác thực để deploy. Team domain và Database ID đã có bằng chứng.
2. Token build cần quyền D1 để chạy migration; quyền thực tế chưa được xác minh. Không đưa API token vào source hoặc chat.
3. Phiên Cloudflare dashboard từ browser đám mây trước đó bị từ chối đăng nhập; không tự thử lặp lại hay vượt chặn.
4. Chưa có Windows/POS/AI account thật hoặc biên nhận bài đa nền tảng trong bản mới. Source/test không phải bằng chứng đăng công khai.
5. Chỉ chuyển `tiemvangkimbaolam.id.vn` sau khi workers.dev, đăng nhập chủ, DB/R2, POS và hàng đợi được kiểm tra. Giữ `main`, Worker và database cũ.

Hành động kế tiếp: hoàn tất các kiểm tra trong checkout, commit/push phần đã qua; lấy AUD không bí mật để cấu hình và triển khai qua kết nối GitHub đã có. Cập nhật chính tệp này với commit đã kiểm chứng, lệnh test và kết quả thực tế.

## Mốc kiểm tra gộp 27/10/2026

GitHub đã lưu pipeline tại d78e2685eb128e1fc3986037ddc00928f4c4e808 và giá POS/staging tại b358c75c77dfdab6074703c77ee622914811b424. Checkout cuối đã chạy `node --test tests/*.test.mjs`: 70/70 đạt, không bỏ qua; `npx tsc --noEmit`, `git diff --check`, `npm run build:cloudflare` và Wrangler deploy --dry-run đều đạt.

Bổ sung cuối: vòng sửa dùng attempt/lease mới và không nhận nhầm ACK cũ; giá 07/12/19 giờ Việt Nam chốt nguồn POS ≤5 phút, không dựng bù kỳ thiếu giá; native prompt phân biệt bản giá POS có hash với nguồn HTTP. FFmpeg thực sự tạo MP4 dọc có audio từ fixture, chưa phải giọng Hoài My/tài khoản thật.

ZIP Windows 86.353 byte, SHA256 57ca7ad59d50ed5334402c8b149d36984908836381e0fa257d50e33191d1ebf6; không chứa cấu hình/token/profile. Video tạm chỉ dọn sau đủ biên nhận; ảnh tin/sản phẩm và bản Windows được giữ.

Deploy hiện cho phép staging workers.dev khi AUD trống, Admin vẫn khóa 503; check:cloudflare và nghiệm thu đầy đủ tiếp tục yêu cầu AUD. Không đổi DNS. Kết nối GitHub đã tạo check Workers Builds cho kbl-web-moi nhưng chưa có bằng chứng deploy thành công hoặc schema/R2 thật đã sẵn sàng. Cần lấy AUD không bí mật của ứng dụng KBL Admin Moi, xem log build nếu còn lỗi, rồi kiểm tra Admin/POS/Chrome/video thật trước khi chuyển miền. Không khẳng định Facebook/YouTube đã nối hay đã đăng tin.

## Kết nối POS bổ sung 27/10

Đã thấy GitHub check Workers Builds: kbl-web-moi thành công tại commit 242629a768dafdf8ae3c78e7db5068d608400fb6; AUD đã cấu hình. HTTP health từ môi trường kiểm tra vẫn bị Cloudflare 403/1010, chưa đọc được trạng thái DB/R2 thật. Không thay DNS.

Lưu thư mục POS hợp lệ giờ bật ngay đọc chỉ đọc giá/kho/ảnh, không cần POST đầu tiên nếu POS ghim URL cũ. Kiểm tra settings/inventory trước khi lưu; đường dẫn lỗi không thay lựa chọn cũ. Phiếu cầm/bảo hành vẫn cần POST riêng. Bộ test gộp 71/71 đạt sau khi cài đủ dependency.

## Bộ source liên thông đầy đủ 27/10

98/98 kiểm thử đạt, không bỏ qua; TypeScript, build Cloudflare, Wrangler dry-run và diff check đạt. Phòng R40/20 vị trí đã tích hợp tài nguyên thật; POSfullsource ghép base với sáu file mới nhất, chỉ thay kết nối, bỏ credential cũ và bốn addon phụ thiếu source, có manifest/proof công thức. OAuth6nền tảng + Telegrambot; publishing FB/IG/Threads/YT/Telegram; inbox FB/IG/Telegram có opt-in+webhookxácthực. TikTok/Zalo vẫn cần thao tác/quyền nền tảng; không có tuyên bố tài khoản thật đã đăng.

Đóng ba ZIP nguồn riêng bằng scripts/package-suite.py. Source được lưu nhánh riêng kbl-full-suite-source, không cập nhật nhánh triển khai kbl-web-moi hoặc DNS trong bước giao source này. Bộ WEBSITE có cả source Windows/POS để chạy các test liên thông; package riêng dùng để cài từng thành phần. Không chứa token vận hành, dữ liệu khách hay Chrome profile.

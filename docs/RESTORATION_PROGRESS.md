# Khôi phục KBL trên Cloudflare

Mục tiêu: website trên Cloudflare, POS là nguồn chỉ đọc, Windows chạy đội Chrome miễn phí và dựng video; giữ ảnh sản phẩm/bài viết, chỉ dọn video tạm khi đủ biên nhận. Không thay công thức hay dữ liệu POS.

## Mốc đã lưu

- Source gốc đã xác minh trên GitHub: `a36141ee43ed2d751c3f242c225bd1812d30efc4`, nhánh `kbl-web-moi`, repo `tiemvangkimbaolam-png/kbl-web`.
- Bộ sửa của phiên điều phối trước chưa được commit/push trước khi môi trường kết thúc; không xem các báo cáo test cũ là kết quả của checkout hiện tại. Đang khôi phục, chạy lại kiểm tra và lưu theo từng phần.
- Ảnh người dùng cung cấp xác nhận Worker mới nối đúng nhánh, D1 `kbl-web-moi-db` UUID `642e732e-5bc1-42cd-b155-ba6e3eac32dd`, R2 private `kbl-web-moi-media`, Access app `KBL Admin Moi` đã tạo; team `billowing-sunset-1714`. Chưa có AUD hoặc biên nhận triển khai ứng dụng mới.

## Công việc đang xử lý

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

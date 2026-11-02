# Luồng tự động 08:00 / 13:00 / 19:00 — giờ Việt Nam

Giá vàng và sản phẩm theo ba khung giờ mới, thay lịch 07/12/19 và 10/16. Chưa bật đội/xuất bản thì không gửi. Admin → Bản tin & Video có nút bật các công tắc đã được chủ yêu cầu và tải bản vá Windows nhỏ. Không tự thay tài khoản, token hay OAuth đang dùng.

Sản phẩm: cần kho POS đủ mới trong 5 phút, đúng 3 SKU còn hàng/được trưng bày/có ảnh riêng. Khóa ba SKU và tạo hồ sơ/job trong một D1 transaction; hai cron không dùng trùng. Đọc cả lịch sử edition cũ. Hết món mới hoặc chỉ còn1–2 món thì chờ, không quay vòng món đã dùng. SKU đang được hồ sơ giữ cũng không nhận sang bài khác. Giữ ảnh gốc, không yêu cầu Gemini vẽ lại trang sức. Giá là giá đã chốt lúc tạo; caption/ảnh nói rõ giá tham khảo theo thời điểm và đường dẫn bộ ba đọc giá hiện tại. Trước đăng kiểm tra lại còn trưng bày, còn hàng và ảnh gốc đúng SKU; không tự sửa giá POS. SKU chỉ đánh dấu published khi đủ biên nhận.

Local worker tạo 3 JPEG1080×1350 từ ảnh thật + tên, mã, tuổi vàng, trọng lượng, giá, liên hệ và QR đúng sản phẩm. Không crop hoặc chỉnh thiết kế trang sức. Dựng video1080×1920 ba cảnh, giọng Hoài My và phụ đề có word-boundaries; không dùng giọng giả lập khi dịch vụ TTS lỗi. Bảng giá tạo JPEG bằng code từ snapshot9999/980/610, không cho AI vẽ con số. YouTube nhận video dọc 1080×1920 (Shorts; mô tả tự thêm #Shorts); Facebook Page nhận album ảnh; Instagram và Threads nhận carousel. Các caption có hashtag phù hợp và link /g/{storyId}?utm_source=...; Instagram/Threads giới hạn5 hashtag và Threads ≤500 ký tự. Bản giá gold dùng giá/thời điểm snapshot trong caption.

Tin tức: nghiên cứu, viết và duyệt độc lập theo pipeline hiện có. Sau duyệt, server lấy model ảnh khả dụng từ Gemini models.list, không đoán model theo tên quảng cáo; mỗi lượt tạo một ảnh, đủ hai ảnh mới qua image-review. Mặc định4 lần tạo/ngày UTC, có thể đặt KBL_NEWS_AI_IMAGES_PER_DAY theo quota thật; không hứa miễn phí. Hạn mức/HTTP429 giữ hàng đợi. Mất phản hồi/ảnh chưa lưu rõ trạng thái thì attention để đối soát, không gọi lại tự động. Prompt bám headline/summary/script/nguồn và phản hồi duyệt, ảnh khác góc, không giả ảnh sự kiện/người thật/giá. Ảnh gốc kết quả và model/prompt lưu riêng. Local worker dựng video và JPEG có nhãn minh họa AI cho các kênh ảnh.

Phát hành: checkpoint trước từng mutation, đợi từng child ảnh FINISHED, tạo parent rồi publish, đợi permalink; Facebook có post_id/permalink, YouTube processed+public. Mất phản hồi giữ attention, không đăng lại. Một kênh lỗi không làm mất receipt kênh khác. File tạm chỉ xóa khi đủ biên nhận; ảnh bài và sản phẩm giữ. Tin/bộ mới xếp FIFO, không hủy bản đang làm vì nội dung mới đến.

## Cài bản vá Windows

Tải /downloads/KBL_AUTODANG_3SP_20261028.zip (chỉ file sửa, không có dữ liệu hay key). Giải nén trực tiếp vào KBL_WINDOWS_MOI đang dùng, nơi có kbl-config.json, đồng ý chép đè source. Chạy CAP_NHAT_AUTODANG.cmd một lần. Script chỉ dừng node launcher/worker thuộc đúng thư mục để nạp mã mới; không đóng Chrome, không đổi hồ sơ/cookie, POS hoặc config. Cần FFmpeg/ffprobe và TTS runtime cũ đã cài. Heartbeat mới version2.2.0 có capability image/render. Node24 giữ như hợp đồng bộ cũ. Bản vá nhỏ chỉ đổi mã; muốn dựng bằng Remotion thì cài bộ đầy đủ /downloads/KBL-WINDOWS-2.zip, chạy npm install một lần trong thư mục remotion. Thiếu Remotion, worker tự dùng FFmpeg.

## Việc chủ cần hoàn tất

- Chọn kết nối thật Facebook Page, Instagram Professional, Threads và YouTube; quyền upload/publish cần nền tảng cấp. Kiểm tra tài khoản nhận bài.
- Cài bản vá rồi để máy Windows/local worker chạy; chưa có bằng chứng máy đang online thì chưa thể hứa dựng/đăng khi máy tắt.
- Bật luồng trong Admin, kiểm tra kho/ảnh/giá đã đồng bộ, kiểm tra thông tin tiệm trong Cài đặt.
- Đối soát những lượt attention bằng receipt/session thật, không xóa hàng đợi và đăng lại khi chưa rõ kết quả.

## Phạm vi kiểm chứng

Tests dùng D1/SQLite, provider Gemini/Meta giả lập với payload có nhãn fixture; không phải bài đã đăng bằng tài khoản thật. FFmpeg dựng JPEG/QR và video thật bằng ảnh/audio kiểm thử; TTS trong test là giọng tổng hợp fixture, không xác minh dịch vụ Hoài My trên máy người dùng. Chưa kiểm tra script restart bằng Windows thật, quyền OAuth hiện tại, quota Gemini thật hoặc bài công khai trên kênh. Không coi Cloudflare build thành công là bằng chứng đã đăng.

Kiểm chứng 31/10: 184/185 kiểm thử qua; lỗi còn lại là so hash provenance nguồn POS có sẵn (không sửa tệp POS). API, FIFO, per-platform publishing, provider Groq/Gemini, cache render và FFmpeg dựng thật đều qua. Chưa chạy lại TypeScript --noEmit/build Cloudflare sau thay đổi Remotion; cần người dùng build khi triển khai. FFmpeg đã dựng cả video ba cảnh/sản phẩm và bộ hai cảnh; caption và biên nhận ảnh kiểm tra bằng provider fixture.

Tương thích hàng đợi cũ: outbox đã gửi trước cập nhật giữ caption/video/fingerprint cũ; không chuyển một lượt đang publish thành album mới. Kết quả render cũ thiếu poster JPEG tiếp tục video; bản render mới có poster sẽ đi theo nhánh ảnh.

Script cập nhật kiểm tra local health release2.2.0 trước khi báo khởi động xong. Nếu worker được mở trực tiếp bằng BAT_DAU.cmd, cần Ctrl+C cửa sổ đó trước; không tự dừng một tiến trình có đường dẫn chưa xác minh. Kiểm tra startup chưa phải biên nhận dựng/đăng thành công.

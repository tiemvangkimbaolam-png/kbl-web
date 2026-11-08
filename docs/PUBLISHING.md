# Xuất bản mạng xã hội từ video đã duyệt

Bộ code này có adapter thật cho Facebook Page, Instagram chuyên nghiệp liên kết Page, Threads, YouTube và Telegram. Tài khoản phải được OAuth/bot kết nối, chọn đúng Page/kênh và cấp quyền xuất bản. Có OAuth không có nghĩa ứng dụng đã được nền tảng duyệt quyền đăng. YouTube không có API riêng cho Shorts: video dọc 1080×1920 tối đa 3 phút được nhận là Shorts và mô tả tự thêm #Shorts. Các test dùng phản hồi giả lập; chưa xác nhận bài nào đã đăng bằng tài khoản người dùng.

## Cấu hình và nối luồng

1. Hoàn thành `SOCIAL_CONNECTORS.md` và khai báo secret bằng Cloudflare Dashboard hoặc Wrangler secret; không ghi token vào GitHub.
2. Chọn tài khoản đích trên Admin. Cho phép phát hành trong cài đặt, chọn nền tảng của hồ sơ.
3. Pipeline chỉ gửi nội dung khi tin, ảnh và video đã qua đủ bước duyệt. `publishSocialStory(storyId, platform, connectionId, {origin,videoId,headline,caption})` tiến thêm một bước mỗi lần cron.
4. Route `GET /api/publishing-media/:token` gọi `servePublishingMedia(token)`. Link ngẫu nhiên hạn hai giờ chỉ cung cấp đúng video tạm của hồ sơ cho Meta tải; không mở toàn bộ bucket và không dùng quyền Admin/worker trong URL.
5. Không tự coi container, upload-session, token OAuth hay HTTP 200 là bài hoàn thành. Instagram/Threads chờ xử lý container rồi lấy ID bài và permalink. YouTube đợi trạng thái processed + public; bản dựng 1080×1920 ≤ 3 phút và mô tả có #Shorts để vào Shorts. Facebook đợi video ready và permalink. Telegram cần message_id và link kênh (kênh riêng ghi rõ chỉ thành viên xem được).
6. Chỉ khi có receipt cho mọi nền tảng trong hồ sơ mới dọn video/audio/phụ đề tạm. Ảnh sản phẩm/tin và video gốc Windows giữ lại.

## Lỗi và mất kết nối

Bản ghi `publishing-outbox` lưu từng bước trước khi gửi. Nếu ngắt sau khi POST hoặc chưa rõ đã nhận, trạng thái thành `attention` và không gửi lại. Container/session đã biết tiếp tục được thăm dò. Cần đối chiếu trên nền tảng khi mất biên nhận cuối; không bấm đăng mới hàng loạt để xử lý. Trạng thái trả Admin qua `publishingStatus()` được lọc, không trả token, upload-session hoặc URL media grant.

Các loại record `publishing-outbox`, `publishing-lock`, `publishing-media` là dữ liệu riêng, không đưa vào export công khai. `sessionUrl` và token media grant là bí mật vận hành tạm thời, không in log.

## TikTok và Zalo

TikTok giữ trạng thái cần thao tác: creator-info mới, nội dung có thể chỉnh, quyền riêng tư do người dùng chọn và đồng ý rõ từng lượt. Không dùng luồng Direct Post tự động cho công cụ nội bộ để vượt xét duyệt. Người dùng có thể dùng video đã dựng để đăng qua ứng dụng TikTok. Code không trả receipt giả khi chỉ có publish_id.

Zalo OA có OAuth/refresh trong bộ kết nối nhưng nội dung OA, broadcast, tư vấn UID và tin theo số điện thoại là quyền/loại API khác nhau. Publisher giữ trạng thái manual thay vì đoán quyền. Không lấy số điện thoại POS làm OA UID và không khẳng định miễn phí.

## Tài liệu gốc đối chiếu 27/10/2026

- YouTube: https://developers.google.com/youtube/data/reference/rest/v3/videos/insert
- Upload tiếp nối: https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
- Telegram Bot API: https://core.telegram.org/bots/api#sendvideo
- TikTok: https://developers.tiktok.com/doc/content-sharing-guidelines/
- Meta Instagram: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/content-publishing/
- Meta Threads: https://developers.facebook.com/docs/threads/posts/
- Facebook video: https://developers.facebook.com/docs/video-api/guides/publishing/

YouTube/Telegram/TikTok đã đọc được tài liệu gốc khi triển khai. Meta trả 429/không truy cập được từ môi trường kiểm tra; adapter giữ API version theo biến môi trường và cần chạy thử Page/kênh đã cấp quyền trước khi bật lịch sản xuất. Không khẳng định API Meta đã được kiểm chứng trực tiếp.

# Tin nhắn tư vấn tự động

Source có bộ nhận/trả lời **Facebook Messenger Page, Instagram Professional qua Facebook Login và Telegram private chat**. Đây là code để triển khai, chưa có bằng chứng webhook hoặc tin trả lời thật trên tài khoản của chủ.

## Bật đúng kết nối

1. Hoàn tất OAuth, chọn đúng Page/Instagram account hoặc kiểm tra Telegram bot ở Kết nối.
2. Chủ gọi `POST /api/admin/inbox/CONNECTION_ID` với JSON `{ "enabled": true, "confirmMessagingPermission": true }`. Thao tác này xác nhận cửa hàng chủ động bật trả lời, không thay quyền nhà cung cấp. Trả về callback và verify token. Gọi lại với `{ "enabled": false }` để tắt. `GET /api/admin/inbox` chỉ trả trạng thái đã lọc, không trả token.
3. Đăng ký callback `https://DOMAIN/api/social-inbox/PLATFORM/CONNECTION_ID` trong ứng dụng nền tảng. Meta cần sự kiện messages và quyền Messenger/Instagram messaging được duyệt; quyền xuất bản bài không tự cấp quyền đọc/trả lời inbox. Có thể cần pages_messaging, pages_manage_metadata và instagram_manage_messages theo sản phẩm và chế độ ứng dụng.
4. Meta: đặt secrets `KBL_META_APP_SECRET` và `KBL_META_WEBHOOK_VERIFY_TOKEN`. Callback GET trả challenge đúng verify token; POST kiểm HMAC SHA256 trên nguyên body. Không bật callback chưa kiểm chữ ký.
5. Telegram: bật tự trả lời trong Admin sẽ gọi `setWebhook` với callback công khai, `allowed_updates:["message"]` và `secret_token` dẫn xuất riêng cho từng connection; tắt sẽ gọi `deleteWebhook`. Khóa dẫn xuất dùng `KBL_INBOX_WEBHOOK_SECRET` nếu có, nếu không dùng `KBL_SOCIAL_ENCRYPTION_KEY` đã cấu hình cho kết nối. Đổi khóa dẫn xuất thì phải bật lại để đăng ký webhook mới. Chỉ nhận human text trong private chat, bỏ nhóm/channel/bot/ảnh/tệp.

## Luồng dữ liệu

Webhook có xác thực → ID sự kiện ổn định → `consultation` awaiting-reply → hàng đợi consult hiện có → một AI Chrome đang sẵn sàng trả lời từ kho/giá công khai → inbox outbox gửi qua tài khoản đã chọn. Một message bị giao webhook lại không tạo cuộc tư vấn khác. Không đưa recipient/token vào prompt. Website không đọc dữ liệu cầm đồ riêng để tư vấn.

`processInboxReplies()` cần được cron gọi sau pipeline tick. Giới hạn năm câu trả lời mỗi vòng. Bước gửi ghi `sending` trước khi POST; mất kết nối/không có biên nhận ghi `uncertain` và **không tự gửi lại**, tránh gửi hai lần. Trạng thái sending còn lại sau crash cũng giữ để chủ đối chiếu. Meta chỉ gửi trong24giờ từ tin nhắn nhận; quá hạn dừng, không gắn tag để vượt giới hạn. Không tự mở chiến dịch nhắn khách từ số điện thoại POS. Telegram không suy ra UID từ số điện thoại.

## Phạm vi chưa hỗ trợ

Threads/TikTok không được coi là có inbox API tự do chỉ vì OAuth thành công. YouTube comment polling/replies và Zalo OA messaging cần thêm quyền/loại tài khoản/gói được duyệt; bộ này không giả xác nhận đã trả lời trên các nền tảng đó. Zalo OA UID khác số điện thoại POS. Mọi kết nối cần kiểm tra quyền hiện hành tại nền tảng khi cấu hình.

## Kiểm tra source

`node --test tests/inbox.test.mjs` kiểm chữ ký raw-body/tamper, đúng target Page, loại echo, private human Telegram, cửa sổ24giờ, checkpoint trước POST và không thử lại khi kết quả chưa rõ. Không phải kiểm thử live.

Tài liệu chính thức đối chiếu 27/10/2026:
- https://developers.facebook.com/docs/graph-api/webhooks/getting-started/ (truy cập tài liệu từ môi trường kiểm tra bị429; cần đối chiếu Dashboard sản phẩm khi cấu hình).
- https://developers.facebook.com/docs/messenger-platform/send-messages/
- https://core.telegram.org/bots/api#setwebhook
- https://core.telegram.org/bots/api#sendmessage

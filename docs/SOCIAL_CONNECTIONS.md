# Kết nối tài khoản mạng xã hội — source 27/10/2026

Đây là luồng OAuth phía server thực sự: tạo state → mở trang cấp quyền của nền tảng → callback đúng chủ → đổi code → đọc tài khoản có quyền → chọn đích → lưu token mã hóa. Không dùng cookie Chrome để đăng mạng xã hội. Đăng nhập AI miễn phí trong Chrome là bộ kết nối Windows khác, không dùng các token mạng xã hội ở đây.

Bộ source đã có Facebook Page, Instagram Professional qua Facebook Login, Threads, YouTube, TikTok Login Kit Web, Zalo OA OAuth v4 + PKCE; Telegram xác minh Bot Token + Chat ID. Mỗi lần kết nối có ID riêng, hỗ trợ nhiều tài khoản/đích; tối đa 100 kết nối. Facebook/Instagram trả danh sách đích, người quản trị phải chọn đúng Page/Instagram nếu có nhiều hơn một. Chọn một Page không tự cấp quyền các Page khác.

## 1. Nhập và lưu ứng dụng ngay trong Admin (28/10/2026)

Mở Admin → Kết nối: mỗi nền tảng OAuth có form App/Client ID, Secret, nút **Lưu ứng dụng**, callback và quyền. Facebook/Instagram dùng chung ứng dụng Meta; Graph API version lấy từ dashboard app. Sau Lưu, bấm **Thêm tài khoản**, OAuth rồi chọn đúng Page/kênh. ID nền tảng đích được đọc từ quyền đã cấp, không tự gõ một ID để vượt quyền.

App Secret nhập tại đây được mã hóa AES-GCM trong D1 (record `social-app`), không trả lại giá trị bí mật cho trình duyệt. Ô Secret để trống giữ khóa đã lưu; đổi App ID phải nhập Secret tương ứng. Cấu hình đã lưu trong Admin được ưu tiên hơn biến ứng dụng trong Cloudflare. Nếu chưa lưu trong Admin thì dùng biến Cloudflare như cũ. Thay cấu hình trong khi OAuth đang chờ sẽ yêu cầu bắt đầu OAuth lại.

Khóa mã hóa chủ vẫn ở Cloudflare: dùng `KBL_SOCIAL_ENCRYPTION_KEY`, hoặc dùng `KBL_PRICE_ENCRYPTION_KEY` đang có khi chưa cấu hình khóa mạng xã hội riêng. Giữ nguyên khóa đã dùng; thêm một khóa khác sau khi đã lưu token có thể làm mất khả năng giải mã. Không đưa khóa chủ vào D1 hoặc localStorage. Chỉ cần cấu hình khóa chủ một lần, không cần vào Cloudflare mỗi lần lưu App ID/Secret.

## Cấu hình Cloudflare thay thế / tham khảo


Giữ `KBL_AUTH_MODE=cloudflare-access`, OWNER_EMAIL, Team Domain và AUD của ứng dụng Admin. Bảo vệ `/admin*` và `/api/admin*`, gồm callback bên dưới. Callback GET vẫn cần phiên đúng tài khoản chủ và state một lần. Không tạo ngoại lệ công khai cho toàn bộ `/api/admin`.

Nếu miền callback công khai (`KBL_PUBLISHER_PUBLIC_BASE_URL`) chưa được Cloudflare Access bảo vệ nhưng miền Admin workers.dev đã được bảo vệ, đặt `KBL_ADMIN_ORIGIN` bằng HTTPS gốc của miền Admin đó. Khi provider trả callback về miền công khai mà request không có phiên Access, worker chỉ chuyển tiếp nguyên trạng `state`, `code`/`error` sang đúng đường dẫn callback trên miền Admin. Việc đổi code lấy token vẫn chỉ chạy sau khi Access xác thực chủ và state còn kiểm tra UID, nền tảng, thời hạn, cấu hình ứng dụng; không có endpoint công khai nào đổi token. Nút **Thêm tài khoản** tạo state ngay trên miền Admin đang đăng nhập, không còn chuyển cả trang sang miền callback.

Đặt biến công khai (không phải secret):

| Biến | Giá trị |
|---|---|
| KBL_PUBLISHER_PUBLIC_BASE_URL | HTTPS gốc đang dùng thật, ví dụ `https://tiemvangkimbaolam.id.vn` |
| KBL_ADMIN_ORIGIN | HTTPS gốc của miền Admin đã được Cloudflare Access bảo vệ, ví dụ `https://kbl-web-moi.tiemvangkimbaolam.workers.dev`; để trống nếu callback chạy trực tiếp trên miền công khai đã có Access |
| KBL_META_GRAPH_VERSION | Phiên bản Graph API đang chọn trong app Meta, dạng `vNN.0`; không tự đoán phiên bản |
| KBL_META_APP_ID | Meta App ID cho Facebook + Instagram |
| KBL_THREADS_APP_ID | Threads App ID |
| KBL_GOOGLE_CLIENT_ID | OAuth Client ID loại Web application |
| KBL_TIKTOK_CLIENT_KEY | TikTok Client Key loại Web |
| KBL_ZALO_APP_ID | Zalo App ID |

Các secret đặt bằng Cloudflare Workers → Settings → Variables and Secrets; hoặc `wrangler secret put TEN_BIEN --config wrangler.cloudflare.json`:

- `KBL_SOCIAL_ENCRYPTION_KEY`: khóa ngẫu nhiên 32 byte, biểu diễn đúng 64 ký tự hex chữ thường; tạo một lần và cất bản an toàn. Khóa này mã hóa token trong D1, không phải token mạng xã hội. Không thay tùy tiện: token cũ sẽ không giải mã được nếu mất khóa.
- `KBL_META_APP_SECRET`
- `KBL_THREADS_APP_SECRET`
- `KBL_GOOGLE_CLIENT_SECRET`
- `KBL_TIKTOK_CLIENT_SECRET`
- `KBL_ZALO_APP_SECRET`

Không ghi các secret vào ZIP, GitHub, wrangler vars, ảnh chụp hoặc đoạn chat. App ID có thể là biến thông thường. Bot Token Telegram nhập qua form bảo vệ trong Admin, gửi HTTPS, mã hóa trong D1; không lưu vào localStorage/browser config. Cấu hình thiếu hiện rõ chưa sẵn sàng, không xác nhận giả.

Trên hostname thử workers.dev, giữ `KBL_PUBLISHER_PUBLIC_BASE_URL` là miền callback đã đăng ký và đặt `KBL_ADMIN_ORIGIN` là hostname thử đã có Cloudflare Access; callback sẽ được chuyển tiếp về Admin thử. Nếu đổi base, phải đổi callback trong dashboard nền tảng cho khớp rồi kết nối/kiểm tra lại. Không mở Admin ở miền công khai chưa có Access.

## 2. Callback chính xác

Prefix: `KBL_PUBLISHER_PUBLIC_BASE_URL` + các path sau. Không thêm dấu `/` cuối, query hay fragment vào callback đã đăng ký.

| Nền tảng | Callback | Quyền đăng được yêu cầu |
|---|---|---|
| Facebook Page | `/api/admin/social/oauth/facebook/callback` | pages_show_list, pages_read_engagement, pages_manage_posts |
| Instagram Professional | `/api/admin/social/oauth/instagram/callback` | pages_show_list, pages_read_engagement, instagram_basic, instagram_content_publish |
| Threads | `/api/admin/social/oauth/threads/callback` | threads_basic, threads_content_publish |
| YouTube | `/api/admin/social/oauth/youtube/callback` | youtube.upload, youtube.readonly |
| TikTok Web | `/api/admin/social/oauth/tiktok/callback` | user.info.basic, video.publish, video.upload |
| Zalo OA | `/api/admin/social/oauth/zalo/callback` | Quyền OA do quá trình cấp quyền Zalo xác nhận |
| Telegram | Không có OAuth callback | Bot phải có quyền gửi vào chat/channel đã chọn |

Các quyền tư vấn/bình luận/inbox không tự có từ quyền đăng. Khi muốn chăm sóc, bật lựa chọn xin quyền tư vấn trong form kết nối (`enableInbox: true`), thực hiện cấp quyền lại và cấu hình webhook riêng. Facebook xin thêm pages_read_user_content/pages_manage_engagement/pages_messaging/pages_manage_metadata; Instagram xin instagram_manage_comments/instagram_manage_messages/pages_manage_metadata; Threads xin threads_read_replies/threads_manage_replies; YouTube xin youtube.force-ssl cho bình luận. Các scope bổ sung không được xin mặc định khi chỉ đăng bài, cần xét duyệt nền tảng theo ứng dụng. Không mô tả `connected` là đã bật trả lời khách trên tất cả nền tảng. Hướng dẫn và adapter đăng bài nằm ở tài liệu xuất bản của bộ source.

## 3. Trình tự từng nền tảng

### Facebook và Instagram

Tạo app trong Meta Developers, khai báo domain, privacy policy và callback; nhập App ID/Secret/Graph version. Người đăng nhập phải có quyền tạo nội dung Page. Instagram cần tài khoản Professional gắn Page. Bấm kết nối, cấp quyền, chọn Page/Instagram và kiểm tra tên/ID đích. Nhánh này không dùng Instagram Login riêng, do đó không trộn scope `instagram_business_*`.

Server đổi token ngắn sang token dài của Meta, đọc `/me/accounts`, lưu Page token trong kho mã hóa. Quyền thực tế có thể thiếu hoặc bị thu hồi; platform có quyền từ chối đăng dù OAuth thành công. App Review/Advanced Access có thể cần tùy app và người dùng.

### Threads

Dùng Threads App ID/Secret riêng và callback Threads. Server đổi code lấy token ngắn, đổi token dài; làm mới token dài chưa hết hạn qua endpoint chính thức. ID người dùng đọc từ Threads `/me` và giữ làm đích đăng.

### YouTube

Bật YouTube Data API v3, OAuth Web Client, khai báo callback. Đưa tài khoản vào tester khi app đang Testing; OAuth yêu cầu offline access và consent để lấy refresh token. Chọn kênh YouTube được trả về và kiểm tra ID trước đăng. App chưa được kiểm toán upload có thể bị giới hạn video private; OAuth không thay kiểm toán. Video dọc 1080×1920 tối đa 3 phút được nhận là Shorts và mô tả tự thêm #Shorts; vẫn cần xử lý YouTube thành công.

### TikTok

Đăng ký Login Kit Web + Content Posting API và callback HTTPS tĩnh. Flow web sử dụng state + client secret server, không nhầm PKCE của SDK mobile/desktop. Token/refresh được xoay qua v2 endpoint.

`video.publish` và `video.upload` là quyền tách biệt, người dùng có thể cấp một phần. Direct Post cần quyền và audit riêng, preview/metadata chỉnh được, privacy do creator chọn và đồng ý rõ ràng cho bài. Tiện ích đăng nội bộ của riêng cửa hàng không được cam kết sẽ được duyệt audit. Không dùng cookie bot hoặc giả use case để né hạn chế. OAuth thành công không có nghĩa tự đăng public được.

### Zalo OA

Tạo Zalo App, liên kết OA và callback đúng. Source dùng OA v4 + PKCE (Base64URL SHA256 verifier), App Secret gửi trong header `secret_key`; không nhầm token Social user với OA. Kết nối đọc thông tin OA qua `getoa`. Refresh token có thể dùng một lần; bản mới thay thế nguyên tử. Mạng đứt khi refresh sẽ yêu cầu kết nối lại thay vì gửi lại token cũ mù quáng.

OA publishing, nhắn UID và ZBS template theo số điện thoại là các nhánh quyền/gói/phí riêng. Không biến số điện thoại POS thành OA UID. Không tự gửi nhắc lãi chỉ vì có OAuth; cần consent, mẫu duyệt và trạng thái phiếu thật.

### Telegram

Tạo bot bằng BotFather; thêm bot vào channel với quyền đăng; nhập Token và Chat ID/username ở Admin. Source gọi `getMe`, `getChat` để xác minh; với nhóm/channel còn gọi `getChatMember` để kiểm tra quyền gửi/đăng. Chat riêng chỉ nhận được tin sau khi người dùng nhắn bot trước. Không gửi bài thử lúc kết nối. Bot không tự bắt đầu hội thoại với số điện thoại POS; người dùng cần mở/nhắn bot trước khi chăm sóc riêng.

## 4. Trạng thái và khôi phục

- `choose-target`: OAuth đã đổi token nhưng chưa chọn đích; chưa được đăng.
- `connected`: thông tin tài khoản/đích đã đọc và token được lưu; chưa chứng minh một bài đã được chấp nhận/công khai.
- `reconnect-required`: refresh không chắc chắn/thất bại hoặc cần cấp lại quyền. Kênh này phải kết nối lại; không làm mất kết quả các kênh khác.
- `expiresAt` không rõ thì hiển thị chưa xác định, không bịa ngày hết hạn.
- Quyền `scope` chỉ đánh dấu đã xác minh nếu provider thực sự trả scope; source không biến danh sách xin quyền thành danh sách đã cấp.

Refresh có khóa theo connection ID để không dùng đồng thời refresh token một lần. Callback state hết hạn sau 10 phút, ràng buộc đúng UID chủ/nền tảng/hostname và chỉ được sử dụng một lần. Callback trùng không đổi code lần hai. Kết quả lỗi không phản hồi token/code/error body của provider vào UI.

Ngắt kết nối xóa kho token của connection khỏi website. Việc này không tự thu hồi grant phía nhà cung cấp: vào phần ứng dụng đã liên kết của nền tảng để thu hồi nếu muốn. Với Google, thu hồi một grant có thể ảnh hưởng những kết nối khác cùng OAuth project; không tự revoke hàng loạt khi chỉ bỏ một đích.

Token mạng xã hội và state không được đưa vào export Admin hoặc cấu hình Windows. Backup D1 chứa ciphertext, không có khóa mã hóa; giữ secret riêng nếu cần khôi phục. Website chỉ công khai tên/ID đích và trạng thái.

## 5. Kiểm tra trước khi bật lịch

1. Đúng hostname HTTPS và callback, cùng tài khoản chủ Cloudflare Access.
2. Danh sách provider báo cấu hình đủ; token không xuất hiện trong trạng thái/export/browser storage.
3. Đúng Page/Instagram/kênh/OA/channel, quyền thực tế đủ.
4. Dựng một bản tin thật, nhận ID từng nền tảng rồi kiểm tra trạng thái xử lý/privacy/permalink.
5. Chỉ dọn media tạm khi có đủ biên nhận bắt buộc; ảnh POS/tin và file gốc Windows vẫn giữ.

Kiểm thử của source dùng SQLite và API fixture, không dùng tài khoản/token thật của chủ cửa hàng. Chưa coi OAuth thật, bài công khai, app review hoặc phí là đã xác nhận.

## Nguồn chính thức đã đối chiếu ngày 27/10/2026

- Google OAuth web/offline/refresh/revoke: https://developers.google.com/identity/protocols/oauth2/web-server
- YouTube upload: https://developers.google.com/youtube/v3/docs/videos/insert
- TikTok Login Kit Web: https://developers.tiktok.com/docs/en/login-kit-web
- TikTok OAuth token: https://developers.tiktok.com/docs/en/oauth-user-access-token-management
- TikTok Direct Post: https://developers.tiktok.com/docs/en/content-posting-api-get-started
- Threads official Meta collection: https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api
- Meta Pages API: https://developers.facebook.com/documentation/pages-api
- Zalo OA OAuth example: https://docs.zaloplatforms.com/docs/OA
- Telegram Bot API: https://core.telegram.org/bots/api

Tài liệu Meta có thể yêu cầu phiên truy cập và giới hạn đọc tự động; Graph version được cấu hình theo app thay vì cứng một bản tự đoán trong source.

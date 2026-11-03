# Bộ liên thông Kim Bảo Lâm

Ba phần dùng cùng một giao thức, không phải ba website độc lập.

| Gói | Cài ở đâu | Vai trò |
|---|---|---|
| KBL_WEBSITE_FULL.zip | GitHub → Cloudflare Workers | Website, Admin, D1/R2, OAuth, hàng đợi và biên nhận |
| KBL_WINDOWS_FULL.zip | Máy Windows có Chrome và FFmpeg | Giữ phiên AI, nhận việc, đọc POS, giọng đọc và dựng video |
| KBL_POS_FULL_SOURCE.zip | Thư mục source POS riêng để kiểm tra/build | POS bán hàng/cầm đồ, công thức gốc và bộ nối local |

Không tải cả ba ZIP vào hosting. Không đưa dữ liệu thật, cookie, kbl-config.json hoặc khóa OAuth lên GitHub. Cài source POS vào thư mục thử riêng; chưa chép đè POS đang dùng hoặc data.

## Thứ tự nối

1. Website: đọc HUONG_DAN_CLOUDFLARE.md, tạo đúng D1/R2 và migration, cấu hình Access theo owner. Cấu hình OAuth theo SOCIAL_CONNECTIONS.md và PUBLISHING.md. Chưa có quyền không bật kênh đó.
2. Admin → Kết nối → Kết nối Windows: tạo worker và tải kbl-config.json riêng. Đặt bên cạnh KBL_WINDOWS.cjs trong gói Windows.
3. Chạy MO_CAU_HINH.cmd một lần. Chọn thư mục data có settings.json, inventory_db.json và product-photos. Worker chỉ đọc; giá/kho/ảnh hoạt động dù POS giữ URL cũ.
4. Phiếu cầm/bảo hành/sự kiện bán dùng URL local http://127.0.0.1:39878 và mã relay riêng, không dùng mã worker hoặc mã ghép AI. Xem POS_SYNC.md và hướng dẫn POS.
5. Admin → Đội AI → +: thêm từng tài khoản và chọn máy Windows online. Mở đúng Chrome, đăng nhập trên trang AI chính thức, ghép tiện ích. Không nhập tài khoản AI vào OAuth mạng xã hội. Tối đa 20 tài khoản, điều phối theo khả năng/heartbeat.
6. Admin → Kết nối → Tài khoản mạng xã hội: đăng nhập OAuth, chọn trang/kênh đích, bật Nhận bản tin mới. Kế hoạch đích được chốt theo mỗi tin; đổi đích chỉ áp dụng tin mới. Khóa ứng dụng lưu Cloudflare Secrets, token lưu mã hóa trong D1.
7. Bật đội AI rồi thử một tin. Bật xuất bản khi đã kiểm tra nội dung, ảnh, video, đích nhận. Giá POS chốt theo 07/12/19 giờ Việt Nam; không dựng bù giá lịch sử. Có đủ biên nhận mới dọn video tạm; giữ ảnh và bản Windows.
8. Chạy CHAY_NEN.cmd hoặc BAT_TU_KHOI_DONG.cmd. Sau thiết lập, không cần để CMD hay trang local mở. Máy phải đang bật và có mạng; đăng nhập/captcha/quota nền tảng vẫn có thể yêu cầu thao tác thật.

## Phạm vi nguồn và điều kiện bên ngoài

Có source OAuth Facebook Page, Instagram Professional, Threads, YouTube, TikTok, Zalo OA; Telegram dùng BotFather. Adapter đăng video có ở Facebook/Instagram/Threads/YouTube/Telegram. TikTok cần creator preview/consent và quyền ứng dụng; Zalo tùy quyền OA/gói. Không mô tả OAuth thành giấy phép tự động đăng mọi nền tảng.

Phòng AI dùng lại tài nguyên R40 với 20 robot và trạng thái công việc thật. Chuyển góc nhìn/khu nghỉ không cấp quyền API hay thay đổi tiến trình. Xem AI_OFFICE.md.

Kiểm thử mô phỏng không chứng minh tài khoản thật đã đăng công khai. Trước sử dụng chính thức phải thử POS riêng, so phiếu/số tiền, ảnh đúng SKU, TTS thật và từng biên nhận mạng xã hội. Không cần gửi mật khẩu/API secret cho người xây source.

Gói WEBSITE chứa repository đầy đủ (kèm windows/pos-source để chạy kiểm thử liên thông); hai ZIP Windows/POS là các phần tách sẵn để cài từng máy. Cloudflare chỉ bundle website, không triển khai Electron hay hồ sơ Windows. Không chép source POS từ gói web lên POS đang bán hàng.

Tư vấn inbox: đọc INBOX.md, xin quyền riêng, bật từng kết nối rồi đăng ký webhook trên nền tảng. Hỗ trợ tin chữ Facebook/Instagram/Telegram; không coi bình luận YouTube, Threads/TikTok/Zalo là đã có adapter inbox.

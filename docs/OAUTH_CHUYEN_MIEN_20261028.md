# Sửa nút thêm tài khoản — 28/10/2026

Ảnh chủ cung cấp cho thấy Threads đã lưu ứng dụng, Instagram chưa đủ cấu hình. Không có URL thanh địa chỉ, network log hay kết quả cấp quyền thật trong ảnh nên chưa kết luận được toàn bộ lỗi vận hành.

Mã cũ từ chối POST OAuth start nếu Admin đang ở workers.dev trong khi KBL_PUBLISHER_PUBLIC_BASE_URL dùng tên miền tiệm. UI hiện lỗi ở đầu section và lần polling kế tiếp xóa lỗi. Nút nay chuyển về Admin /admin/ket-noi trên miền callback với ý định nền tảng và cờ inbox; chỉ sau đó tạo state bằng POST cùng origin, rồi chuyển đến URL cấp quyền chính thức. Ý định được xóa khỏi URL trước khi bắt đầu và chỉ xử lý một lần trong vòng đời component; chặn bấm trùng khi đang mở. Không chuyển khóa, token, code hoặc session giữa hai hostname.

Có tiến trình, lỗi và link tiếp tục ngay cạnh nền tảng. Lỗi OAuth không bị polling status xóa. Ứng dụng thiếu cấu hình vẫn khóa nút, có hướng dẫn tại chỗ. Callback hoàn tất/hủy/thất bại quay về màn hình Kết nối và hiện kết quả; không coi việc lưu app là cấp quyền.

Không đổi Cloudflare Access, OWNER_EMAIL, callback đăng ký, scope mặc định, credential hay tài khoản nhận bài. OAuth start vẫn yêu cầu chủ, POST JSON cùng origin và đúng public base. Callback vẫn kiểm tra state một lần, UID, platform, origin, TTL và cấu hình app.

Kiểm chứng: 173/173 kiểm thử qua; có 14 kiểm thử kết nối/chuyển miền, callback dùng một lần, chủ khác, hủy cấp quyền, lỗi phiên và URL bất thường. TypeScript --noEmit và build Cloudflare thành công. Các provider và identity trong kiểm thử là fixture; chưa kiểm tra việc chủ bấm và cấp quyền trên tài khoản Meta/Threads thật. Trình duyệt kiểm thử cục bộ chưa chạy được vì bản tải Chromium không hợp lệ; không ghi nhận đó là kiểm thử trình duyệt thành công.

Còn phụ thuộc thực tế: Cloudflare Access phải bảo vệ /admin và /api/admin trên miền callback; callback phải khớp dashboard nhà cung cấp; app ID/secret/use case và tài khoản tester/quyền phải đúng. Không bỏ bảo vệ hoặc thay callback để né lỗi nền tảng. Nếu còn lỗi, cần xem thông báo tại đúng nền tảng; không gửi secret/token/code trong chat.

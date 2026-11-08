# Khách hàng, tư vấn, thử trang sức và lịch sử - 28/10/2026

## Các đường vận hành

- Chat nhiều lượt, dạng bong bóng; lịch sử tối đa 12 tin, dùng dữ liệu công khai sản phẩm/giá. Gọi Groq trước; lỗi, quota hoặc không có câu trả lời thì dùng Gemini. Google Models.list được đọc với key trên server, lọc generateContent, tách text/image. Ưu tiên thế hệ/dòng model mới, tự thử model khác khi 404/410/quota. Cache danh sách tối đa một giờ; khi model bị ngừng, làm mới danh sách. Danh sách chỉ là ứng viên: quyền/quota thật phải được kiểm tra bằng generation thành công. Điểm xếp thứ tự theo tên không phải benchmark chất lượng. Có thể ghim GROQ_CHAT_MODEL, GEMINI_CHAT_MODEL, GEMINI_IMAGE_MODEL.
- Góp ý đi vào record feedback, không đưa vào consultation. Admin → Khách hàng → Hòm thư góp ý chọn Telegram riêng cho chủ tiệm. Kết nối Telegram cần được xác minh ở phần Kết nối trước. Khi chưa chọn vẫn giữ góp ý ở Admin; không tuyên bố đã gửi Telegram. Lỗi gửi không rõ giữ unknown, không tự gửi trùng.
- Chi tiết bảng giá thay bằng biểu đồ thế giới và hai tab lịch sử: thế giới, Việt Nam (giá tiệm). Bảng giá tiệm đầu trang vẫn giữ. Lấy mẫu thế giới 5 phút/lần nếu nguồn đọc thành công, giữ 30 ngày. Giá tiệm lưu một lần mỗi ngày trong cửa sổ 13:00-13:04 Asia/Ho_Chi_Minh khi ba dòng 999.9/980/610 đủ mới; lưu giờ ghi và giờ quan sát thật, không dựng bù ngày bỏ lỡ. Lịch sử tiệm được giữ, không xóa theo lịch dọn video. Không tự nhập số liệu quá khứ giả để vẽ biểu đồ.
- TV có địa chỉ từ cấu hình; nếu chưa có dùng nguyên địa chỉ đang hiển thị trên trang chủ cũ đã chuyển sang template mới. Giá lớn, đậm, nút Fullscreen dùng thao tác bấm thật của người xem. Trình duyệt TV không hỗ trợ Fullscreen thì cần nút phóng to của trình duyệt.

## Tài khoản khách

- Số điện thoại chuẩn hóa 0xxxxxxxxx, tên và mật khẩu mới tối thiểu 12 ký tự. Mật khẩu chỉ lưu hash PBKDF2-SHA256 100.000 vòng với salt riêng và HMAC pepper từ secret server; đây là mức theo giới hạn WebCrypto workerd, không được coi là 600.000 vòng OWASP. Pepper dùng KBL_CUSTOMER_AUTH_PEPPER, hoặc khóa social/price hiện có. Không đổi pepper khi đã có tài khoản nếu chưa có kế hoạch di chuyển hash.
- Cookie __Host-kbl_customer: HttpOnly, Secure, SameSite=Lax, Path=/; DB chỉ giữ hash token. Session 30 ngày; đổi mật khẩu tăng authVersion, thu hồi phiên cũ. Có rate limit theo IP và số điện thoại. Không tự nối tài khoản mới với hồ sơ POS riêng tư chỉ dựa vào số điện thoại đã nhập; số chưa xác minh không chứng minh đã mua hàng.
- Quên mật khẩu: nhập số điện thoại → nhận mã OTP → đặt mật khẩu mới. Không có API đọc hoặc gửi lại mật khẩu cũ. SMS tự động dùng Twilio Verify nếu có TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID trong Secrets. Cần tài khoản/dịch vụ SMS thật; không hứa SMS miễn phí. Nếu chưa có SMS, chủ tiệm xác minh khách rồi cấp mã một lần 10 phút tại Admin → Khách hàng. Mã chỉ lưu hash, không có endpoint công khai để lấy mã. Không cho bất cứ ai chỉ biết số điện thoại đọc mật khẩu.

## Thử trang sức Gemini

- Bắt buộc session khách; quota ban đầu 5. Admin thêm lượt sau khi xác nhận giao dịch và nhập mã tham chiếu. Không sửa POS. Grant có requestId chống cộng trùng.
- Cần GEMINI_API_KEY có quyền tạo ảnh; dùng Models.list để chọn model image hỗ trợ generateContent. Key text không đảm bảo có quota tạo ảnh. Không tự mua/nâng gói của nhà cung cấp; quota/phí phụ thuộc key/project đang dùng.
- Cần ảnh sản phẩm gốc đã đồng bộ và xác nhận đồng ý của khách. Ảnh cá nhân chỉ xử lý trong bộ nhớ request và gửi sang Gemini, không lưu file đầu vào. Ảnh kết quả ở R2 private, chỉ chủ tài khoản xem/tải qua API, lưu tối đa 7 ngày. Phải đối chiếu kết quả AI với mẫu; prompt giữ thiết kế không chứng minh kết quả khớp 100%.
- Server giữ lượt trước khi gọi provider; requestId bảo vệ mất ACK/bấm lại. Một yêu cầu đang chạy trên mỗi tài khoản. Lỗi được xác nhận không có ảnh hoàn lượt; mạng không rõ giữ unknown và không tự gọi lại. Admin có chức năng đối soát/hoàn lượt unknown một lần sau khi xác nhận khách không nhận được ảnh.
- Mặc định trần 30 yêu cầu ảnh mỗi ngày UTC cho cả tiệm; đổi KBL_TRYON_DAILY_LIMIT (1-500) nếu chủ chấp nhận quota/chi phí tương ứng. Không tự tăng cap vì có nhiều tài khoản. Không biến ảnh khách hoặc ảnh AI thành ảnh sản phẩm POS.

## Kiểm chứng và giới hạn

Các test dùng provider/SMS giả lập hoặc mã khôi phục của staff trong database thử; không gửi SMS thật, không dùng ảnh khách thật. Cần nghiệm thu riêng đăng ký/đăng nhập trên HTTPS, key Groq/Gemini thật, một ảnh Gemini thật, một góp ý Telegram, mốc 13 giờ và fullscreen trên TV thật. Danh sách model khả dụng không chứng minh tất cả model sẽ trả kết quả. Không dùng ảnh/quota/session của phiên này để báo bài đăng đa nền tảng đã thành công.

Nguồn giao thức: https://ai.google.dev/api/models ; https://ai.google.dev/api/generate-content ; https://www.twilio.com/docs/verify/api/verification ; https://www.twilio.com/docs/verify/api/verification-check ; https://developers.cloudflare.com/workers/runtime-apis/web-crypto/ .

# Kiểm chứng local thật — 03/11/2026

Quy tắc hiện hành tại `QUY_TAC_LOCAL_AI_API_20261103.md`. Không đổi công thức, tiền, dữ liệu POS, quyền kênh hoặc khóa API.

## Đã chạy thật

- Cloudflare `kbl-web-moi` triển khai commit `385a1a94bb2e4590eef217101853a790a0cb440e` thành công qua GitHub Workers Builds. Check của dự án khác `kbl-backup` lỗi; không dùng nó làm kết luận cho website mới.
- Worker cục bộ phục hồi và trả health giao thức đúng trên cổng39878. Bật lại đội đang tạm dừng theo yêu cầu tiếp tục tự động. Giữ quyền xuất bản đã bật và danh sách kênh chỉ gồm website.
- Năm bảng giá có đủ bảy bước và biên nhận đăng thật: hai lượt chờ13:00/19:00 ngày02/11, hai lượt thay đổi07:56/07:59 và lịch08:00 ngày03/11. URL, chủ xử lý từng bước và biên nhận nằm trong `BIEN_NHAN_DANG_THAT_20261103.json`.
- Giá ở lượt cũ không bị thay bằng giá mới. Trang công khai ghi rõ mốc chốt và không gọi đó là báo giá trực tiếp. Lượt giá mới tự bắt đầu sau khi lượt trước đủ biên nhận; tin thị trường đang giữ ảnh không chặn bảng giá.
- Windows thực tạo hai thẻ, MP3, phụ đề và video1080×1920; đã lưu biên nhận file. Số điện thoại0899 979 797 đã lưu trong Admin và thêm vào chân mẫu. Hai preview cũ không được dùng làm bài sản phẩm thật.

## POS

Đã cài hai tệp trình bày `pawn.html`, `kbl-jewel-ui.js` vào source và app.asar lúc07:59 ngày03/11. Archive hiện tại có năm bản vá worker khác bản sao lưu02/11; đã chuẩn bị lại trên đúng archive mới để giữ chúng. Sao lưu riêng tại `work/installation-backup/presentation-20261103` ngoài source bàn giao. Payload gốc và mọi entry khác giữ nguyên.

Hai hàm trình bày phiếu thay đổi: `pawnUpdateRateLabels`, `loadSavedTemplates`; các hàm khác và markup giữ nguyên. Bố cục đổi vàng chuyển chính các nút/ô nhập, không thay handler hoặc công thức. Sáu tệp POS được bảo vệ giữ hash; không ghi dữ liệu nghiệp vụ, không đóng hoặc tải lại cưỡng bức POS. Đã đọc lại tệp từ archive, khớp source/candidate. Kiểm tra trước đó trên fixture trình duyệt; màn hình POS đang mở và in giấy thật chưa được xác nhận sau cài. Bản mới có hiệu lực khi ứng dụng nạp lại bình thường.

## Điểm còn thiếu thực tế

- Sản phẩm: catalog công khai377 món, chỉ1 món có ảnh; cần3 ảnh riêng. Ảnh hiện có ở SKU KBL-KA96VM (Nhẫn) là ảnh dây chuyền trong mẫu người dùng gửi, chưa được xác nhận khớp món. Không thay/xóa ảnh hoặc tự công bố bộ sản phẩm thiếu dữ liệu.
- Tin thị trường:9 tài khoản đã ghép nhưng0 kết nối Chrome tại thời điểm kiểm tra. Windows báo kiểm tra hồ sơ quá thời gian. Giữ lượt Gemini Bủn đang chờ cảnh2 và lượt tư vấn Chrome cũ; không xóa lease hoặc gửi trùng.
- Tư vấn: đã gửi đúng một câu hỏi kiểm tra nội bộ chỉ hỏi tên cửa hàng, lưu riêng và không tạo bài công khai. Groq/Gemini đều chưa trả lời, trạng thái health mới lúc08:00 vẫn lỗi; không có việc Chrome mới. API có cấu hình không đồng nghĩa gọi được. Cần chẩn đoán mã lỗi/quyền/hạn mức qua Admin; không yêu cầu gửi khóa bí mật vào chat.
- Mạng xã hội: chưa có tài khoản nhận bài được cấp quyền/chọn; hiện chỉ có biên nhận website. Không báo Facebook/Instagram/Threads/YouTube/TikTok/Telegram đã đăng.
- Bản build nguồn344/344 kiểm thử đã đạt; phần bổ sung hiển thị mã lỗi API chỉ là trình bày, build lại thành công. TypeScript toàn repo còn năm lỗi cũ, không tuyên bố đạt.

## Sửa lỗi gọi API trên Cloudflare

Sau khi hiển thị health HTTP0 cho cả hai nhà cung cấp, phát hiện mã dùng `redirect:'error'`. Tài liệu Cloudflare xác nhận chế độ này ném TypeError trước khi gửi yêu cầu: https://developers.cloudflare.com/workers/runtime-apis/request/. Đổi đúng ba lệnh gọi ở consult-provider/gemini-models sang `manual`. Giữ cấm tự theo redirect; phản hồi3xx không được coi là kết quả và khóa không gửi sang đích Location. Không đổi model, khóa, hạn mức hoặc bật thanh toán. Kiểm thử chặn chế độ không hỗ trợ, thử Groq→Gemini, luồng tư vấn riêng và redirect sang host lạ đều đạt; build đạt. Đang xác minh lại chính câu hỏi nội bộ đã lưu, không gửi câu hỏi mới.

Kết quả cuối08:16: commit802d3e6 đã được Cloudflare kbl-web-moi triển khai thành công08:15:12. Chính câu hỏi cũ đã chuyển answered và trả lời “Dạ, cửa hàng tên là TIỆM VÀNG KIM BẢO LÂM ạ.” Admin ghi Groq HTTP401 và Gemini HTTP200/model gemini-4-argon từ danh sách API thật. Fallback Gemini đã hoạt động; Groq cần chủ sửa khóa/quyền trên Cloudflare, không gửi khóa vào chat.15 kiểm thử liên quan đạt; không tạo thêm câu hỏi, bài công khai hoặc việc Chrome. Kết quả này thay trạng thái tư vấn chưa xác minh ở phần trước; các điểm thiếu ảnh sản phẩm, Chrome và quyền mạng xã hội vẫn mở.

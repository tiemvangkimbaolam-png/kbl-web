# Sales Studio V1.3.9 — chỉ Hình ảnh & nội dung tự động

Dựa trực tiếp trên gói `kbl-weba.7z` ông gửi ngày 20/09/2026. Chưa triển khai lên hosting.

## Cập nhật đúng phạm vi

Bản vá `KBL_SALES_STUDIO_V1_3_9_PATCH.zip` chỉ cần thay **hai file chạy ứng dụng**:

1. `app.js` trong Application root của Node.js.
2. `views/admin.html` trong cùng ứng dụng.

Sao lưu hai file hiện tại trước khi chép đè. Không chép `app.js` vào `public/`. Không cần thay Home, bảng giá, modules, vendor, package.json, thư viện npm hay cấu hình kết nối. Giữ nguyên dữ liệu, ảnh đã tạo và các thiết lập tự động hiện có. Restart Node.js rồi Ctrl+F5 ở Admin; tab Hình ảnh & nội dung hiện V1.3.9.

Thư mục tests, tài liệu và báo cáo trong gói phục vụ kiểm tra mã, không bắt buộc chép lên hosting. Nếu cần quay lại bản trước, khôi phục đúng hai file đã sao lưu rồi restart. Gói mã đầy đủ đi kèm giữ các file còn lại từ bản ông gửi; các thay đổi có sẵn trước phiên này cũng được giữ.

## Các điểm hoàn thiện

- Khi Autopilot tổng và Tạo trước 3 poster đang bật, bộ ảnh đã có trong hàng đợi tiếp tục được chuẩn bị dù Tự động đăng đang tắt. Việc lập thêm lịch mới vẫn giữ quy tắc cũ. Bản cập nhật không tự bật công tắc đăng.
- Nếu một file poster đã READY bị mất nhưng ảnh nền AI còn lưu, bộ ghép phục hồi từ nền đã lưu, không gọi AI tạo cảnh lại. Ảnh còn tốt được giữ.
- AI Art Director từ chối ảnh: chỉ tạo lại SKU đó, đưa nhận xét/lỗi của lần trước vào yêu cầu sửa. Các ảnh đã duyệt được tái sử dụng.
- Nếu dịch vụ duyệt ảnh gián đoạn: thử lại phần duyệt, không tiêu thêm lượt tạo cảnh. Ba lần bị loại trên cùng SKU thì dừng tự tạo lại; Admin hiện rõ lý do và có nút thử lại sau khi xem ảnh nguồn.
- Nút thử lại xử lý ngay lỗi tạm thời; vẫn tôn trọng quota API và hạn mức tạo ảnh/ngày. Hạn mức trong ngày được tính lại lúc 00:00 theo giờ Việt Nam. Mỗi lần tạo lại cũng tính lượt.
- Trước khi dispatch, kiểm lại file và URL HTTPS. Nếu ông vừa tắt tự đăng, sản phẩm vừa hết hàng hoặc thông tin thay đổi trong lúc kiểm tra, hệ thống giữ bài lại.
- Thay thế dữ liệu SKU trong lúc tạo ảnh sẽ làm bộ đang xử lý phải kiểm tra lại trước READY.
- Admin hiện kết quả duyệt/lỗi từng ảnh, phần xem caption theo kênh, cùng hai thiết lập lượt ảnh AI/ngày và thời gian chờ khi API hết quota. Không tăng hạn mức cũ tự động.
- Giữ bộ ghép chữ, thẻ SKU, giá, thông tin tiệm, logo và QR của V1.3.8. Chỉ READY khi đủ 3 ảnh và qua Design/Facts/QR/HTTPS QA.

## Đã xác minh

- `npm run test:growth`: đạt trên Sharp và khi toàn bộ yêu cầu tải Sharp bị chặn; dùng dữ liệu tạm và dịch vụ AI/HTTPS giả lập.
- Tạo đủ 3 poster; lưu/đọc lại trạng thái; tiếp tục sau lỗi quota; không tạo trùng khi gọi đồng thời; QR giải mã từ ảnh cuối; cập nhật giá; khôi phục file thiếu.
- Kiểm thử AI từ chối từng SKU, phản hồi sửa ảnh, giới hạn ba lần, dịch vụ duyệt gián đoạn, hạn mức 0 và bật/tắt đăng giữa lúc kiểm tra.
- `npm run test:startup`: năm tình huống thành phần ảnh thiếu; Home/Admin vẫn HTTP 200 và API không có xác thực vẫn 401.
- Kiểm tra giao diện Admin, thoát ký tự nội dung/lỗi, source audit và startup status: đạt.
- Đối chiếu mã: ngoài các hàm Sales Studio Hình ảnh, mã server và các phần Admin khác không đổi. **379 file gốc giữ nguyên từng byte**; hai file chạy ứng dụng và bốn file kiểm thử thay đổi. Chi tiết trong `SALES_STUDIO_SCOPE_V1_3_9.json`.

Kiểm tra security/release toàn bộ dự án còn vướng `public/app.js` đã có sẵn trong gói đầu vào. File này được giữ nguyên theo yêu cầu không sửa phần khác; không đánh dấu các kiểm tra toàn dự án là đạt.

Chưa kiểm thử Gemini bằng tài khoản thật, chất lượng ảnh sản phẩm thương mại hay đăng bài lên mạng xã hội thật. Các kiểm thử ở đây không gọi dịch vụ AI trả phí và không đăng bài. Sau cập nhật có thể tắt Tự động đăng, giữ Tạo trước 3 poster bật và theo dõi một bộ ảnh; chỉ bật đăng theo ý ông sau khi xem kết quả thực tế.

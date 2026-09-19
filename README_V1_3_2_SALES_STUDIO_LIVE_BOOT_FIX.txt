KBL V1.3.2 SALES STUDIO LIVE BOOT FIX
Ngày: 19-09-2026

Lỗi bắt được từ ảnh production:
- Tab Sales Studio > Hình ảnh & nội dung có thể mở ở trạng thái đã được nhớ từ localStorage nhưng không tự gọi Growth Autopilot status.
- Vì vậy badge giữ “ĐANG TẢI”, 4 metric vẫn “—”, dù backend có thể đang sống.
- Khi API lỗi, lỗi trước đây chỉ đẩy vào khối cấu hình nâng cao đang thu gọn nên màn hình chính không nói rõ nguyên nhân.

Đã sửa:
1. Mở tab Hình ảnh & nội dung -> gọi status ngay.
2. Reload trang mà tab Hình ảnh đang được nhớ -> tự gọi status ngay.
3. Mở lại Sales Studio khi tab Hình ảnh đang active -> tự đồng bộ ngay.
4. Sau TẢI DỮ LIỆU -> nếu đang ở tab Hình ảnh thì ưu tiên status trực tiếp, không chờ hàng đợi background.
5. Khi token admin vừa nhập/thay đổi -> tự tải pipeline.
6. Khi quay lại cửa sổ/tab trình duyệt -> tự refresh.
7. Poll 10 giây vẫn giữ.
8. Nếu API lỗi/timeout -> badge chính hiện LỖI API và lý do ngay trên màn hình, không giấu trong Advanced.
9. Chặn request status trùng nhau bằng một shared Promise.

Không đổi:
- app.js / backend Growth Autopilot
- package.json / package-lock.json
- Cloudflare Worker
- AI Master / Gemini / POS / Try-on / Video / Publisher

Kiểm tra:
- node --check app.js: PASS
- 5 inline admin scripts: PASS
- API route count không đổi
- Không có duplicate id trong admin HTML

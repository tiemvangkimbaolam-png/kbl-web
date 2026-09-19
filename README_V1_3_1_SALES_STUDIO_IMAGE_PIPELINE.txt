KBL SALES STUDIO IMAGE PIPELINE V1.3.1
Ngày: 19-09-2026

MỤC TIÊU
- Gắn PREP-FIRST WORKFLOW vào đúng Sales Studio.
- Sales Studio có 2 tab: VIDEO (giữ nguyên) và HÌNH ẢNH & NỘI DUNG (FULL AUTO).
- Tab Hình ảnh & nội dung chủ yếu để XEM TIẾN TRÌNH, không bắt chủ tiệm bấm từng bước.

LUỒNG FULL AUTO
1. AI Market quét cơ hội.
2. Khóa đúng 3 SKU đang đủ điều kiện.
3. AI Idea Reviewer độc lập duyệt ý tưởng TRƯỚC khi tốn quota tạo ảnh.
4. Content/Fact QA duyệt caption và facts.
5. Tạo trước 3 ảnh.
6. AI Art Director độc lập duyệt từng ảnh.
7. Fact / QR / HTTPS QA.
8. READY TO POST.
9. Đến giờ Publisher chỉ upload media đã READY và nhận Post/Media ID.
10. Revenue Loop học từ kết quả.

GIAO DIỆN SALES STUDIO
- Realtime 8 bước: Cơ hội -> Idea Review -> Tạo 3 ảnh -> Art Review -> QA -> READY -> Publish -> Published.
- Badge trạng thái FULL AUTO / LIVE / cần kiểm tra.
- Campaign đang chạy + % tiến trình.
- 3 thumbnail cho mỗi campaign.
- Điểm AI Idea Reviewer / AI Art Director.
- Facts / QR / HTTPS gate.
- Lịch từng nền tảng.
- Post/Media ID thật ở lịch sử.
- Review/lỗi hiển thị cạnh lịch sử.
- Poll nhẹ 10 giây CHỈ khi tab Sales Studio > Hình ảnh & nội dung đang mở.
- Toàn bộ cấu hình/test cũ vẫn còn nhưng gom vào khối Advanced đã thu gọn.

AN TOÀN / GIỮ NGUYÊN
- Tab VIDEO Sales Studio giữ nguyên.
- AI Master / Market / Gemini / Gold Intelligence / POS / Try-on / Video / Publisher / Revenue Loop giữ nguyên.
- Không đổi package.json hoặc package-lock.json.
- Không xóa API route hay Admin ID cũ.
- Không thay Cloudflare Worker.

LƯU Ý
- Code đã được kiểm tra syntax/static trong gói release.
- Thành công publish production cuối cùng vẫn phụ thuộc token/quyền API thật của từng nền tảng và phản hồi Post/Media ID trên server production.

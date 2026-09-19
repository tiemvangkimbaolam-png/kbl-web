KBL GROWTH AUTOPILOT V1.3.0 · PREP-FIRST WORKFLOW
Ngày: 19-09-2026

MỤC TIÊU
Sắp xếp Growth Autopilot theo đúng quy trình vận hành và đổi pipeline từ tạo ảnh sát giờ sang chuẩn bị ảnh trước.

QUY TRÌNH MỚI
1. LÊN BÀI: AI Market/Master chọn đúng 3 SKU + viết caption + xếp lịch.
2. TẠO ẢNH TRƯỚC: ngay sau khi có lịch, server materialize 3 ảnh và tạo 3 poster trước giờ đăng.
3. AI DESIGN REVIEW: một Art Director Agent riêng dùng model vision/text để kiểm độ giống sản phẩm, bố cục, ánh sáng, độ sang trọng, khả năng đọc.
4. FACT / QR / MEDIA QA: server kiểm facts, logo/QR production và HTTPS 3/3.
5. READY TO POST: chỉ bộ đạt gate mới dùng poster branded. Nếu poster/AI/composer chưa đạt nhưng 3 ảnh thật sạch đã sẵn sàng, dùng SAFE FALLBACK và vẫn chuẩn bị trước.
6. ĐẾN GIỜ: Publisher chỉ dispatch media đã READY; không gọi Gemini tạo ảnh ở phút đăng.
7. GIÁ/SIZE THAY ĐỔI: nếu deterministic composer có thể dùng base image đã lưu để render lại lớp dữ liệu; nếu không, tự hạ về SAFE FALLBACK để không đăng giá cũ.
8. PUBLISHED: chỉ tính thành công khi Publisher nhận Post/Media ID thật; Revenue Loop tiếp tục attribution như trước.

TAB GIAO DIỆN MỚI
- TỔNG QUAN
- 1 · CHUẨN BỊ BÀI
- 2 · ẢNH CHUẨN BỊ ĐĂNG
- 3 · LỊCH & XUẤT BẢN
- 4 · KHÁCH / ĐƠN / HIỆU QUẢ
- KẾT NỐI & CHẨN ĐOÁN

ẢNH CHUẨN BỊ ĐĂNG hiển thị:
- 3 thumbnail / 3 SKU
- nền tảng + giờ dự kiến
- Design AI PASS/FAIL
- Facts PASS/FAIL
- QR PASS/FAIL
- HTTPS 3/3
- READY TO POST hoặc SAFE FALLBACK

PHẠM VI KHÔNG ĐỤNG
- AI Master / Market Intelligence hiện hữu
- Gemini Auto Model hiện hữu
- Gold Intelligence
- Try-on
- Video / Sales Studio
- POS / công thức giá / tồn kho
- Publisher connector credentials / OAuth
- Revenue Loop attribution
- Cloudflare Primary-only control plane V1.2.8
- package.json / package-lock.json

LƯU Ý
- Không thêm dependency mới.
- Deterministic branded poster chỉ được coi READY khi composer + QR/logo + HTTPS + AI Design Review đều đạt.
- Nếu composer không sẵn sàng, hệ thống chuẩn bị trước 3 ảnh sản phẩm thật SAFE FALLBACK; không để tới giờ mới phát hiện.

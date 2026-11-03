# Quy tắc local / đội AI / API — 03/11/2026

Theo lời chủ tiệm chốt lại: giá vàng và sản phẩm dùng mẫu có sẵn, thay dữ liệu, ngày giờ, caption và hashtag theo nền tảng. Đội AI Chrome làm tin thị trường. Tư vấn gọi API Groq/Gemini. Quy tắc này thay phần triển khai trước còn đưa bảng giá qua biên tập/duyệt AI.

## Luồng local

- Ba hàng đợi riêng: giá vàng, sản phẩm, tin thị trường/nhận định. Mỗi hàng đợi giữ thứ tự đến đủ biên nhận đăng; không hủy hoặc sửa giá/lượt/ảnh đang làm.
- Bảng giá và bộ ba sản phẩm được điền nội dung bằng mã từ bản chụp POS có bằng chứng. Nội dung được đối chiếu hash/dữ liệu tự động, ghi đúng tên `local-data-template` và `local-data-validator`; không giả danh tài khoản hay lượt duyệt AI.
- Bảng giá dựng hai thẻ bằng `cards.cjs`; bộ sản phẩm dùng đúng ba ảnh đã trưng bày, đối chiếu SKU/hash và tạo thẻ trong bước dựng. Cổng kiểm tra tệp local giữ hash/biên nhận và ghi `visualAiReview:false`; không tuyên bố máy đã duyệt thị giác bằng AI.
- Việc local không được giao cho tài khoản Chrome. Việc Chrome cũ đã leased/running/attention không bị thay hoặc ghi đè; kết quả chưa rõ vẫn được giữ.
- Sản phẩm hết hàng/ẩn hoặc thiếu ảnh riêng không được xuất bản. Website đăng đúng thẻ đã dựng; ảnh sản phẩm gốc không bị xóa. Giá sản phẩm giữ nguyên từ POS, không tính lại theo bảng giá mới.
- Caption và hashtag tiếp tục dùng `social-caption.mjs`, có mốc giá, thông tin tham khảo, liên kết và giới hạn riêng theo kênh. Không tự thêm kênh hoặc bật công bố khi đang tắt.

## Tư vấn và tin thị trường

Câu hỏi mới chỉ đi API Groq/Gemini, dùng đúng sản phẩm/giá và dữ liệu công khai được cung cấp. Khi API chưa có hoặc lỗi, lưu riêng câu hỏi để thử theo lịch hoặc cửa hàng trả lời; không tạo việc Chrome. Không hủy lượt Chrome cũ chưa rõ kết quả. Đội AI tin thị trường vẫn giữ nghiên cứu nguồn, biên tập, duyệt độc lập, ảnh và biên nhận như trước.

## Mẫu và số điện thoại

Giữ mẫu trắng ngà/hồng đào/đồng đã có. Đối chiếu số công khai trên website là 0899 979 797; đã lưu vào Cài đặt. Mẫu local thêm dòng điện thoại ở chân ảnh, tăng phiên bản theme để không dùng nhầm cache. Đã dựng lại hai bản xem trước đúng dữ liệu cũ, không đưa chúng lên production. Mẫu sản phẩm vẫn có nhãn xem trước/chờ đối chiếu SKU, không tự xác nhận ảnh minh họa đó đúng món.

## Kiểm chứng trước triển khai

344/344 kiểm thử đạt; build Cloudflare đạt. API thật chạy với SQLite trong fixture chứng minh: bảng giá/sản phẩm tới biên nhận mà không có tài khoản Chrome nhận việc; tin đang giữ lease không đổi; giá chốt không bị giá mới ghi đè; dữ liệu/hash bị thay bị chặn; câu hỏi API nhận đúng giá/sản phẩm và giữ riêng, không tạo việc Chrome. FFmpeg thật kiểm tra tệp, bố cục và số điện thoại. Đây chưa phải chứng nhận mọi kênh xã hội đã đăng thật; kết quả production ghi riêng sau triển khai.

Worker thực tế đã cập nhật riêng `cards.cjs` có sao lưu và khởi động lại backend, không đổi cấu hình bí mật, dữ liệu hoặc công thức POS. POS liên 2/bố cục vẫn là tác vụ trước, chưa tuyên bố đã cài khi chưa có kiểm chứng gói chương trình.

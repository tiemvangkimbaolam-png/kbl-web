# Kiểm chứng bản mới — 26/10/2026

## Đã kiểm tra

- TypeScript: `tsc --noEmit`.
- Build Worker bằng helper Sites chính thức.
- Trình duyệt thật: trang chủ, danh mục trống thật từ database mới, giỏ hàng mở/đóng, liên kết trang; bố cục tại 320, 375, 414, 768 px trong khung kiểm tra cùng nguồn. Không thấy phần tử tương tác tràn ngang. Trang Admin chuyển qua đăng nhập ở môi trường managed preview; không giả identity để vượt bước đăng nhập trong trình duyệt.
- Bộ kiểm thử API chạy mã ứng dụng thật, SQLite thật tại memory, D1/R2 adapter giả lập. Kiểm tra: quyền Admin, lưu sản phẩm, chặn cập nhật cũ, tính giá đơn từ server, riêng tư hội thoại, duyệt độc lập, hash/lease, chống nhận việc trùng, từ chối kết quả mâu thuẫn, chuyển việc chưa gửi, giữ việc chưa rõ kết quả.
- Kịch bản 5 mô hình mô phỏng đi đủ 7 bước đến bài website và biên nhận; sau đó video/audio/phụ đề tạm được dọn, ảnh vẫn giữ. Nguồn và nhị phân ở bài kiểm thử là fixture, không phải bản tin, ảnh hoặc video do tài khoản AI thật tạo.
- Transport Windows mới dùng chính browser-hub đã đối chiếu, API v2 và SQLite local trong test; biên nhận được lưu, đồng bộ lại không gửi completion lần hai.
- Cấp phát file SQL có điều kiện: ba upload song song vượt kho 32MB, chỉ hai upload được nhận. Dọn video không xóa ảnh sản phẩm.
- Bản chụp POS: từ chối partial/duplicate SKU, cập nhật/đánh dấu vắng trong một giao dịch, không có hàm ghi ngược POS.
- Tư vấn AI và chủ đề theo giờ: hàng đợi thật trong test, chống tạo chủ đề trùng; chưa phải phản hồi của mô hình thật.

## Chưa có bằng chứng thực tế

- Tài khoản AI, selector Grok, thao tác đính kèm ảnh và tạo ảnh trên các phiên Chrome thật của người dùng.
- Ẩn/mở lại cửa sổ Win32 và tự khởi động trên Windows người dùng.
- Dịch vụ Hoài My trả âm thanh/mốc phụ đề ở thời điểm chạy; FFmpeg dựng video thật bằng bộ mới trên máy người dùng.
- Kênh mạng xã hội đã cấp quyền; bài/video công khai trên Facebook, YouTube, Threads, Instagram, TikTok, Telegram hoặc Zalo.
- Đồng bộ trực tiếp dữ liệu/ảnh trên POS Windows của người dùng. Schema đã đối chiếu source thật và kiểm thử bằng fixture; nguồn giá thế giới đã kiểm tra, cảnh báo biến động 50 USD chưa triển khai.
- Chuyển tên miền chính thức hoặc thay DNS.

Không dùng kết quả mô phỏng hay hình phòng AI để suy ra các mục trên đã hoàn thành.

## Khôi phục giao diện theo website gốc

- Đã mở trực tiếp https://tiemvangkimbaolam.id.vn/ bằng trình duyệt: kiểm tra đầu trang, bảng giá chia hai cột, danh mục/thẻ sản phẩm, các tiện ích, footer và đường dẫn chính sách. Trang công khai truy cập được tại thời điểm đối chiếu.
- Giữ markup/CSS trình bày của website do người dùng sở hữu; bỏ toàn bộ JavaScript/API/controller cũ, handler inline, theo dõi Cloudflare và service worker cũ. Không nhập giá, tồn kho hoặc dữ liệu khách cũ.
- Khôi phục hero, intro, logo, video giới thiệu và 13 trang chính sách công khai. Giữ nội dung chính sách do cửa hàng đã công bố; đây không phải kết luận rà soát pháp lý mới.
- Font trong bản tải cũ thực chất là HTML fallback; đã thay bằng TrueType hợp lệ từ nguồn Google Fonts và kiểm tra magic bytes.
- Các ô giá đọc nguồn mới; đơn vị đồng/lượng được chia 10 khi trình bày đồng/chỉ, không thay dữ liệu gốc. Tải lại danh mục mỗi 60 giây khi trang đang hiển thị.
- Browser QA: giỏ trống mở/đóng được; thử trang sức mở/đóng; Ni 15,6 mm trả Ni 9; tính 100 triệu trong 30 ngày theo mức công khai cũ trả 2,5 triệu tiền lãi tham khảo. Không gửi yêu cầu mua/giao dịch thử lên production. Trang Chính Sách Giá mở đúng nội dung phục hồi.
- 14 bài kiểm thử gồm 11 kịch bản hệ thống trước đó và 3 kiểm thử bổ sung cho Ni, ngày/tầng tính tham khảo, đơn vị, template inert và font thật.
- Tra cứu QR, lịch sử khách/tích điểm POS, cảnh báo biến động thị trường tự động và thử ảnh bằng Gemini chưa nối thật. Bản xem thử 2D chỉ thao tác ảnh trên thiết bị, không phải kết quả Gemini.
- Giao diện Admin/điều phối vẫn là hệ thống mới, chưa thể gọi là bản sao toàn bộ Admin cũ. Không thay quyền truy cập hoặc tên miền.

## Source GitHub được người dùng cung cấp

Đã đọc app.js, views/home.html, views/admin.html, account/customer/lookup/taoprompt, commerce và publisher-media tại commit 6f68320ad2af03893509497011fc9dbcc2e18ad6 (28/09/2026). Các bản app/home/admin đọc cục bộ đã đối chiếu SHA blob Git chính xác. Không có module đội ai-admin39 trong snapshot này, vì vậy không lùi bộ Windows tháng 10 về bản Git tháng 9. Chi tiết trong GITHUB_SOURCE_REFERENCE.json.

Đưa nguồn tham khảo vàng/VCB từ app gốc sang lib/kbl/market.mjs và GET /api/public/market. Chỉ gọi hai nguồn HTTPS cố định, kiểm tra chuyển hướng, giới hạn 650KB/7,5 giây, cache một phút, backoff lỗi 30 giây, bản lưu tối đa sáu giờ và có nhãn cũ. Dùng tỷ giá USD bán ra, không công bố biên lợi nhuận hoặc đổi giá POS.

Hai nguồn công khai đã trả HTTP 200 trong kiểm tra trực tiếp; parser đọc được giá, tỷ giá và thời gian nguồn. Kết quả này chưa thay cho kiểm tra nguồn trên chính edge production. Ba kiểm thử market bổ sung kiểm tra dấu phân cách số, dấu biến động có bằng chứng, quy đổi, gọi trùng, mất nguồn, quá hạn cache, SSRF chuyển hướng và giới hạn thân phản hồi. Tổng 17 kiểm thử.

## Bổ sung POS vào source, chưa triển khai — 26/10/2026

- 26 bài kiểm thử đã qua: 17 bài trước và 9 bài mới. SQLite thật, API ứng dụng thật với D1/R2 adapter giả lập; không dùng dữ liệu khách hàng thật.
- Mapper bám đúng trường code/type/weightLy/priceSell/sellWage/wage/status/webSyncReady. Giá mẫu dùng đúng biểu thức xem trước POS, trước chiết khấu; không lấy priceSell (đồng/chỉ) làm tổng giá món. Giá thiếu nguồn để null.
- Relay Windows → API: giá và kho được lưu; sau khi ghép, Admin không sửa tay danh mục/giá, nguồn Windows thứ hai bị từ chối.
- JPEG theo SKU và SHA-256 được gắn đúng sản phẩm, giữ ảnh qua lần đồng bộ kế tiếp và dọn video. Chặn tên file vượt thư mục; không đọc ảnh original.
- Lãi/phí/tổng phiếu cầm giữ nguyên số POS gửi, kể cả fixture cố ý không có quan hệ tính toán. Code-only không đọc được; QR trùng làm rollback cả bản chụp.
- QR bảo hành giữ ổn định khi retry đồng thời; phục hồi token cũ từ đúng hóa đơn trong sales_db.json ở Windows. Hash file fixture không đổi sau khi đọc. Nội dung mâu thuẫn bị từ chối.
- Mất mạng trả HTTP 503, giữ outbox SQLite. Khởi tạo lại relay vẫn giữ việc/token; ACK cũ không xóa snapshot mới. Một lỗi phiếu không chặn giá/kho.
- Vượt 500 sản phẩm hoặc 20.000 bảo hành không áp dụng một phần.
- Migration 0001 tạo unique expression index cho token QR; đã chạy bằng SQLite trong test. SQL expression được kiểm tra thủ công vì drizzle-kit sinh sai quoting cho json_extract.
- File POS người dùng gửi chỉ đọc, có SHA-256 trong POS_SOURCE_REFERENCE.json. Không chép source POS, dữ liệu khách, khóa hay cookie vào source mới.
- Chưa kiểm thử giao diện tra cứu mới qua trình duyệt hoặc chạy relay với Electron/Windows thật. Chưa deploy thay đổi POS lên bản xem trước, chưa đổi DNS.

## Chuẩn bị Cloudflare riêng — 26/10/2026

- Thêm target build externalCloudflare, giữ nguyên identity/audience/bindings của bản Sites. Không deploy lại Sites và không đăng nhập vào Cloudflare người dùng.
- Tổng 31 test đạt: thêm 4 bài kiểm tra Access JWT và 1 bài chạy cổng Access vào API Admin thật với D1 giả lập. JWT RSA ký thật trong fixture, không phải phiên người dùng. Chặn giả header Sites, sai owner/audience/issuer/chữ ký/thời hạn và cookie trùng.
- Phát hiện và sửa xử lý lỗi async của private media: thiếu quyền trả HTTP 401 qua handler, không để promise lỗi rơi ra ngoài.
- Build riêng Cloudflare và Wrangler dry-run đã qua; upload đóng gói khoảng 993 KiB, gzip 289 KiB (chưa gồm file tĩnh). Đích kbl-web-moi, DB/BUCKET mới; file cấu hình để Database ID/AUD/team domain trống hoặc placeholder và chặn deploy khi chưa điền.
- Có CMD cài/đăng nhập Wrangler và CMD check/build/migrate/deploy; người dùng giữ quyền cho phép OAuth và kích hoạt R2 nếu tài khoản yêu cầu. Không đổi gói hay tự tạo thanh toán.
- Chưa kiểm tra đăng nhập Access thật, triển khai vào tài khoản trong ảnh, nhận POS thật hoặc chuyển domain. Tài liệu hướng dẫn cắt chuyển sau khi kiểm tra workers.dev.

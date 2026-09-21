# Kiểm tra website KBL · V1.3.10

Bản sửa dựa trên gói `kbl-weba.7z` của chủ tiệm và bản Sales Studio V1.3.9 đã hoàn thiện. Phạm vi lần này là kiểm tra toàn website và sửa các lỗi tích hợp có bằng chứng. **Chưa thể kết luận mọi AI trên hosting thật đã hoạt động ổn.** Đã kiểm thử mã và luồng xử lý trong môi trường cô lập; chưa có khóa, nhật ký và cấu hình đang chạy trên hosting để xác minh dịch vụ thật.

## Các lỗi đã sửa

| Lỗi | Ảnh hưởng | Sửa và bằng chứng |
|---|---|---|
| Bộ đọc Gemini lấy đoạn chữ đầu tiên, kể cả phần `thought` | Câu trả lời bị cắt, JSON lỗi; ảnh hưởng Adviser, Prompt AI, Master và các tác vụ dùng chung | Ghép đủ các phần trả lời của một candidate, bỏ phần thought. Kiểm thử phản hồi nhiều phần và JSON qua adapter thật đã đạt. |
| Kiểm tra model báo thành công dù thiếu key, API lỗi hoặc chỉ còn xác minh cũ | Chủ tiệm thấy AI “đã kiểm tra” nhưng gọi thật thất bại | Gemini/DeepSeek trả trạng thái lỗi đúng; giữ model dự phòng đang lưu. Refresh DeepSeek thủ công thực sự probe lại kể cả model không đổi; lịch tự động vẫn tránh probe thừa. |
| Schema Sales Studio thiếu `additionalProperties: false` | Khi Gemini lỗi, OpenAI dự phòng có thể cũng bị từ chối với strict JSON schema | Bổ sung tại bộ tạo schema chung cho object lồng nhau. Kiểm thử Gemini bị từ chối → OpenAI nhận schema hợp lệ cho ideas, pack và captions đã đạt. |
| Cloudflare chỉ chờ 5 giây cho nhiều API đợi AI/model/media | Node còn xử lý nhưng phía trình duyệt đã nhận lỗi timeout | Bổ sung các đường xử lý đồng bộ vào thời gian chờ AI 240 giây có sẵn. Giữ nguyên hidden origin, ranh giới primary-only và cách chuyển sang máy dự phòng. API trạng thái nhanh vẫn 5 giây. |
| Có bản mã máy chủ nằm tại `public/app.js` | Đặt sai vị trí và làm kiểm tra phát hành/bảo mật thất bại | Loại bản sao không có tham chiếu sử dụng; giữ `app.js` ở gốc. Node vốn đã chặn URL này; không có bằng chứng để khẳng định bản sao từng bị công khai trên hosting. Thêm quy tắc tránh chép lại. |

Lệnh `test:ai` trước đây chỉ kiểm tra chuỗi ký tự của Growth/Sales Studio. Nay lệnh này kiểm tra Adviser, adapter AI, trạng thái lỗi và router Cloudflare thật bằng dịch vụ giả lập. Kiểm tra Growth cũ vẫn được giữ dưới tên đúng. CI được bổ sung các kiểm tra AI, route, giao diện và bản phát hành.

## Kết quả theo nhóm chức năng

| Nhóm | Kết quả trong mã/bộ kiểm thử | Phần chưa xác minh trên hosting |
|---|---|---|
| Home, danh mục, bảng giá vàng thế giới | DOM: mục Tất cả, danh mục con, tìm kiếm, thanh danh mục theo header; biểu đồ, tăng/giảm, trạng thái thiếu dữ liệu; tiếng Việt/Anh đạt | Dữ liệu vàng/FX và iframe TradingView thực tế tại trình duyệt của chủ tiệm |
| Admin | Trang trả HTTP 200; API quản trị từ chối thiếu token; 79 API GET có trạng thái đúng theo dữ liệu thử | Token, cấu hình và log máy chủ thật |
| AI tư vấn | Router giá/ngân sách, loại sản phẩm đã bán, chuyển chủ đề sang chính sách; adapter Gemini/JSON đạt | Chất lượng hội thoại mở, giọng điệu và toàn bộ dữ liệu School đang có trên hosting |
| Prompt AI: Gemini/DeepSeek | Đường gọi còn đăng ký; sửa refresh và kiểm tra thiếu key/lỗi/quét model thành công | Toàn bộ hội thoại, trừ lượt, tài khoản khách và prompt đầu ra thật chưa chạy E2E |
| AI Master / nghiên cứu thị trường | Route đọc, adapter JSON và probe grounding giả lập đạt | Google Search thật, độ mới nguồn tin, chu kỳ chạy nền dài hạn |
| Sales Studio ảnh | Tạo 3 ảnh bằng fixture, ghép và quét QR thật, sửa từng SKU, chặn khi QA lỗi, cập nhật giá, khôi phục ảnh thiếu, hạn mức và trạng thái dừng/đăng đạt; chạy được cả có và không có Sharp | Ảnh AI thật có giống hàng không, Art Director thật, quota và tốc độ sinh ảnh |
| Sales Studio video | Router đọc và xác thực worker đạt; ideas/pack/captions qua adapter Gemini và nhánh OpenAI dự phòng đạt | Render FFmpeg, khớp cử chỉ/MC, âm thanh, cue/card và chất lượng video đầu ra thật |
| Local AI Photo / Video worker | 5 endpoint ping/lấy việc xác thực đúng với token thử; thiếu token bị chặn | Máy worker có đang bật, token khớp, môi trường GPU/FFmpeg/browser và kết quả xử lý thật |
| AI Try-on / Veo | Route còn đăng ký; khắc phục thời gian chờ Veo và giữ guard hiện có | Tạo ảnh/video bằng tài khoản thật, model được cấp quyền, hạn mức thử và đầu ra |
| Publisher / CSKH tự động | Router và điều kiện dispatch Sales ảnh có kiểm thử; sửa thời gian chờ các API đồng bộ | OAuth/scope, Page/account, token hết hạn, webhook, tải ảnh HTTPS và Post ID thật. Không đăng bài thử trong đợt kiểm tra này. |
| SEO / AI Discovery / quốc tế | `/robots.txt`, `/sitemap.xml`, trang evidence Việt/Anh trả đúng; route quốc tế vẫn còn | Index/search bên ngoài, thanh toán PayPal, FedEx và tỷ giá thật |
| POS, thương mại, công thức | So sánh AST xác nhận không sửa phần nghiệp vụ; module thương mại giữ nguyên byte | Không thực hiện giao dịch, thu tiền, cầm đồ hoặc đồng bộ POS thật |

Đã ghi nhận 423 đăng ký method/path (gồm alias và middleware), không phải 423 chức năng độc lập. Đã đối chiếu 194 điểm gọi API đọc được từ mã giao diện: 193 khớp route trực tiếp; một điểm là wrapper động của Sales Studio và được đối chiếu với module route. Không còn lỗi cú pháp ở các đoạn script được phân tích. Đây không thay thế kiểm thử bấm mọi nút với tài khoản và dữ liệu thật.

79 API GET: 61 trả 200, các lỗi 400/401/403/404 còn lại đúng trường hợp thiếu tham số, thiếu quyền hoặc không có bản ghi; FX trả 503 có chủ đích khi dịch vụ bên ngoài bị ngắt trong fixture. 5 kết nối worker có token thử, 8 trang public và 3 đường dẫn nguồn riêng tư đều đạt.

## Những điểm cần giữ và kiểm tra trên máy thật

- Bộ School/chính sách/kiến thức nằm trong `KBL_DATA_DIR/ai-knowledge`. Bản source sạch không chứa dữ liệu này. Nếu thư mục dữ liệu bị đổi, mất hoặc khởi tạo trống, AI sẽ thiếu kiến thức đã học dù API vẫn tồn tại. Không sao chép dữ liệu giả lập của tests vào hosting.
- `.env`, `KBL_DATA_DIR`, uploads, khóa mã hóa và thông tin connector là trạng thái vận hành, không được thay bằng dữ liệu từ gói source. Một file zip code không xác nhận được các thiết lập này trên Plesk.
- Local Photo/Video cần worker chạy ở máy tiệm. Token cấu hình không đồng nghĩa worker đang online. Sales Studio vẫn giữ các bước duyệt và chặn xuất bản khi thiếu QA.
- Content Studio hiện có luồng tạo prompt để chuyển Google Flow; đó không đồng nghĩa mọi nút đều tự tạo ảnh qua API. Chưa có đủ yêu cầu lịch sử để kết luận luồng này phải bị thay bằng một kiểu vận hành khác.
- Mã còn nhiều lớp override từ các bản cũ. Các route trùng của upload/video có lớp xử lý nội dung khác nhau; robots/sitemap hiện tại được đăng ký trước bản commerce cũ và đã được kiểm thử. Không xóa hàng loạt các lớp đó trong lần sửa này.
- Tăng thời gian chờ Worker không tự thay giới hạn timeout của Nginx/Passenger/Plesk. Nếu hosting cắt request sớm hơn, cần xem log và cấu hình đang chạy. Các tác vụ chạy nền hiện có được giữ nguyên.

## Phạm vi thay đổi được kiểm chứng

So với V1.3.9: 378/386 file nguồn cũ giữ nguyên byte; 7 file thay đổi và một bản sao `public/app.js` bị loại. Hai file logo/QR trong uploads do runtime tạo bị loại khỏi phép so sánh source và khỏi gói phát hành; không có yêu cầu xóa uploads đang dùng trên hosting.

Trong `app.js`, chỉ 6 node cấp cao của AST thay đổi: bộ đọc Gemini, refresh DeepSeek, API health và 3 route kiểm tra model. Các đoạn server còn lại giữ nguyên AST. `views/home.html`, `views/admin.html`, biểu đồ vàng, module thương mại, Sales Studio core và công thức POS giữ nguyên so với V1.3.9. Bản V1.3.9 Sales ảnh đã có trong gói đầy đủ và patch cộng dồn này.

Chi tiết: `AUDIT_SCOPE_V1_3_10.json`, `AUDIT_ROUTES_V1_3_10.json`, `AUDIT_UPDATE_MANIFEST_V1_3_10.json` và `AUDIT_SHA256_V1_3_10.txt`.

## Cập nhật đúng chỗ

1. Gói FULL là source để mở/đối chiếu trong VS Code. Gói PATCH là bản cộng dồn cho source V1.3.8 từ `kbl-weba.7z` hoặc V1.3.9 đã giao. Manifest liệt kê SHA trước/sau để phát hiện file hosting đã có thay đổi khác. Sao lưu các file sẽ thay trước khi cập nhật.
2. Phần Node: cập nhật `app.js`, `modules/kbl-studio-ai.js`; nếu chưa lên V1.3.9 thì cập nhật thêm `views/admin.html` từ patch. Xóa **đúng bản sao** `public/app.js`, giữ `app.js` ở gốc. File tests/package/CI trong patch phục vụ kiểm tra source; không có dependency mới.
3. Phần Cloudflare: cập nhật `cloudflare-backup/src/index.js` trong **dự án Worker đang dùng** rồi triển khai bằng quy trình sẵn có. Không thay hostname, DNS, route, bindings, wrangler config hay origin bằng giá trị mới. Chỉ upload Node lên Plesk thì lỗi chờ 5 giây ở Worker chưa được sửa.
4. Giữ nguyên `.env`, dữ liệu, uploads và cấu hình hosting. Restart ứng dụng Node sau khi cập nhật source. `/api/health` phải có `aiRoutingRelease: "1.3.10-ai-routing-audit"`. Health chỉ báo cấu hình/trạng thái cục bộ, không chứng nhận AI đã trả lời thật.
5. Trong Admin, chạy kiểm tra model rồi xem trạng thái hiện tại; nếu lỗi, bản này sẽ báo rõ thay vì báo thành công giả. Xác minh token worker, thử hội thoại/chính sách, tạo một bộ ảnh và kiểm tra QR/website/đúng sản phẩm trước khi tin rằng toàn bộ luồng đã thông. Việc đăng thật cần kiểm tra riêng tài khoản/kênh đích.

Không có thay đổi nào được triển khai lên website thật trong đợt này. Công cụ đọc website công khai không truy cập được trang chủ/Admin; điều đó không đủ để kết luận website đang lỗi 500.

## Chạy lại kiểm tra

`npm run check`, `node scripts/audit-source.js`, `npm run test:security`, `npm run test:release`, `npm run test:ui`, `npm run test:ai`, `npm run test:routes`, `npm run test:growth`, `npm run test:startup`, `npm run test:portable` đều đạt trong checkout kiểm thử. Chạy test:release trên source sạch trước các bài test có thể tạo thư mục uploads tạm. Kiểm thử Home/biểu đồ riêng bằng jsdom và so sánh AST/phạm vi thay đổi cũng đạt. Dịch vụ AI, mạng xã hội và thanh toán bên ngoài không được gọi thật.

## Tài liệu API đã đối chiếu

- Google hiện hỗ trợ `store` trên GenerateContent; giữ nguyên tham số này, không coi là lỗi: [GenerateContent request](https://ai.google.dev/api/generate-content).
- Giữ tên model đang cấu hình sau khi đối chiếu, không đổi model chỉ vì tên trông lạ: [Gemini models](https://ai.google.dev/gemini-api/docs/models).
- DeepSeek còn nhận alias cũ; không tự nâng model trong bản sửa này: [DeepSeek models/pricing](https://api-docs.deepseek.com/quick_start/pricing/).
- OpenAI strict schema yêu cầu object đóng và các trường required: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

# Kim Bảo Lâm · Website & Điều phối mới

Dự án mới độc lập. Không nhập dữ liệu cũ, không sửa POS, không thay DNS trong bản này.

- Website: danh mục, ảnh, bảng giá có thời điểm, tin tức, giỏ gửi yêu cầu giữ mẫu, tư vấn có token riêng.
- Admin: sản phẩm, giá, yêu cầu, tư vấn, tối đa 20 tài khoản AI, nhật ký, công việc từng bước, cấu hình và xuất dữ liệu.
- Lưu trữ: D1 cho bản ghi/hàng đợi/biên nhận, R2 cho file; cấp phát dung lượng có điều kiện SQL trước upload. Mặc định kho file 256MB, ngừng nhận file khi chạm trần. Không tạo bản sao database hàng ngày trên hosting.
- Windows mới: cổng 39878, SQLite WAL + synchronous FULL, giữ outbox và trạng thái, dùng Chrome đúng tab, tái mở hồ sơ đã được ghép đúng đường dẫn khi cần. Không nhập hay xóa hồ sơ cũ.
- Đội: research → write → review → image → image-review → render → publish. Người duyệt khác người tạo. Kết quả có biên nhận, lease và hash; chưa rõ đã gửi thì giữ lượt, chưa gửi có bằng chứng thì chuyển người khác.
- Tự vận hành: bật đội, tự tìm chủ đề mỗi giờ (giới hạn 3 hồ sơ đang làm), nhận câu hỏi tư vấn vào hàng đợi. Xuất bản có công tắc riêng, mặc định tắt.
- Nguồn bị chặn được giao tìm nguồn khác, tối đa 3 lần, giữ bản kết quả cũ ở Windows. Không bỏ bước xác minh hay tự chuyển thành duyệt đạt.
- Tài nguyên nặng, bản video gốc và cache giọng giữ ở Windows. Video/audio/phụ đề tạm trên R2 chỉ dọn khi đủ biên nhận. Ảnh sản phẩm và ảnh bản tin đã đăng được bảo vệ.

## Cloudflare của cửa hàng

Đã thêm nhánh build riêng cho Cloudflare trực tiếp, giữ nguyên nhánh Sites. Đọc `HUONG_DAN_CLOUDFLARE.md`. Hai file CMD ở gốc giúp cài/đăng nhập và triển khai Worker mới `kbl-web-moi`; không đè `kbl-backup`, không tự đổi DNS. D1/R2 mới và Cloudflare Access của chủ phải được cấu hình trước.

## Chạy và kiểm tra

Dùng các helper Sites được chỉ định trong môi trường để cài/build/publish. Chạy `node --test tests/*.test.mjs` cho kiểm thử API với SQLite thật và D1/R2 giả lập; nguồn/5 mô hình AI/nhị phân trong bài kiểm thử là fixture, không phải các tài khoản AI thật hoặc bản tin thật.

`npm run db:generate` khi thay schema. SQL/migration đã áp dụng giữ nguyên; các lần sau tạo migration mới. Các binding dùng `DB` và `BUCKET`.

Admin dùng đăng nhập do Sites cung cấp. `OWNER_EMAIL` xác định tài khoản chủ. `SITES_SERVICE_TOKEN` là truy cập dịch vụ riêng do Sites cấp cho bộ Windows trên bản riêng tư, không phải token AI. Hai giá trị được cấu hình trong runtime, không lưu trong Git.

## Bộ Windows

Tải từ Admin → Kết nối. Tạo cấu hình và tải `kbl-config.json` riêng, đặt cạnh `KBL_WINDOWS.cjs`. Dùng thư mục con của worker hiện tại để tìm lại FFmpeg/ffprobe/node-edge-tts đã cài. Nếu ở vị trí khác, khai báo `existingWorkerDir` trong file cấu hình local. Không đưa `kbl-config.json`, hồ sơ Chrome hoặc thư mục `.kbl-render-runtime` lên website.

Chạy `BAT_DAU.cmd` để kiểm tra; `CHAY_AN.vbs` để chạy nền; `CAI_TU_KHOI_DONG.ps1` thêm shortcut khởi động cho riêng người dùng Windows. Nạp tiện ích giải nén trong từng hồ sơ Chrome một lần. Mã ghép được giữ sau khi lưu. Chrome/AI có thể cần người dùng xác minh hoặc đăng nhập lại khi nhà cung cấp yêu cầu; không vượt CAPTCHA.

Node Edge TTS và FFmpeg được tận dụng từ worker người dùng cung cấp. Bản mới yêu cầu mốc phụ đề từ dịch vụ khớp lời đọc, không ước lượng toàn bộ lời đọc. Giọng mạng có thể không sẵn sàng; máy chủ báo lý do và giữ việc.

## Phần cần kết nối thực tế

- Chưa xác minh tài khoản Gemini/ChatGPT/Claude/DeepSeek/Grok thật trên website mới.
- Grok có adapter văn bản ban đầu; selector cần kiểm tra trên giao diện thật. Chưa hỗ trợ ảnh Grok.
- Bộ xuất bản website có sẵn. Các kênh Facebook, Instagram, Threads, YouTube, TikTok, Telegram, Zalo chưa có quyền/token ứng dụng trong hệ thống mới; không đánh dấu đã kết nối hoặc đăng thành công.
- Đã đối chiếu 6 file POS thực tế và thêm relay chỉ đọc cho giá, kho/ảnh, phiếu cầm và bảo hành. Xem `docs/POS_SYNC.md`. Kiểm thử dùng dữ liệu mô phỏng theo schema thật; chưa chạy trực tiếp với POS Windows của người dùng.
- Lịch giá vàng 07/12/19 tạo phiên chờ dữ liệu giá thật khi Windows đang chạy. Chưa có nguồn giá tự động đã xác minh hoặc giám sát ngưỡng vàng thế giới 50 USD; không tự điền giá.
- Chưa trỏ tên miền chính thức. Bản Sites đang riêng tư để kiểm tra.

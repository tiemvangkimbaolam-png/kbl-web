# Bộ Windows và POS chỉ đọc

## Thứ tự thiết lập

1. Triển khai website, migrations D1/R2 và Access. Trong Admin → Kết nối, tạo Windows worker và tải `kbl-config.json` đặt cạnh `KBL_WINDOWS.cjs`. Đây là cấu hình riêng của máy, không đưa vào Git/source ZIP hoặc gửi ảnh token.
2. Cài Node.js 24 và Chrome. Dựng video cần FFmpeg/ffprobe + node-edge-tts; dùng bộ công cụ worker đã có. `node setup.cjs check` kiểm tra cấu hình cục bộ; không giả vờ kiểm tra dịch vụ online.
3. Bấm `MO_CAU_HINH.cmd`: khởi chạy nền, đợi relay sẵn sàng, mở `http://127.0.0.1:39878/`. Chỉ cần trang này lúc thiết lập. Lần sau dùng `CHAY_NEN.cmd`, hoặc bật tự chạy bằng `BAT_TU_KHOI_DONG.cmd`. Chạy `BO_TU_KHOI_DONG.cmd` để bỏ shortcut. Không cần Administrator và không tự đổi PowerShell ExecutionPolicy.
4. Chọn thư mục **data thực tế** của POS, chứa `settings.json`, `inventory_db.json`, `product-photos/index.json`. Không chọn thư mục chứa file cài EXE nếu không có data trong đó. Lưu đường dẫn bật ngay đọc giá/kho/ảnh; worker không sửa POS. Nếu POS ghim URL website cũ thì vẫn đọc được phần này.
5. Phiếu cầm, bảo hành và sự kiện bán cần POST đồng bộ của POS. URL relay và mã local nằm trong “Lấy cấu hình POS trên máy này”; không nhầm mã local với token worker hoặc mã ghép AI. Nếu POS không lưu được URL, chưa được coi những phiếu này đã nối; không sửa công thức để khắc phục.
6. Admin → Đội AI → thêm tài khoản, chọn nhà cung cấp. Worker lấy danh sách sau tối đa một vòng heartbeat. Trang local → mở đăng nhập cho đúng tài khoản, dùng hồ sơ cũ nếu có. Lần đầu trong đúng hồ sơ Chrome: `chrome://extensions` → Chế độ nhà phát triển → tải `EXTENSION` đã giải nén. Lấy mã ghép một lần, dán vào tiện ích, bật nhận việc và kiểm tra phiên.
7. Các tài khoản Gemini/ChatGPT/Claude/DeepSeek/Grok đăng nhập tại trang chính thức. Đây là phiên chatbox, không dùng OAuth mạng xã hội để đăng nhập AI và không sao chép cookie. CAPTCHA, hết hạn đăng nhập hay quota phải được hiển thị đúng; không tự vượt chặn.
8. Admin bật đội AI, gửi một hồ sơ thử, kiểm tra đủ ảnh và video. Cho phép đăng khi muốn xuất bản. Việc OAuth các kênh mạng xã hội cấu hình tại website theo tài liệu riêng; token mạng xã hội không đưa vào extension.

## Chạy nền và khôi phục

Launcher khóa một phiên theo thư mục worker; thấy relay tương thích đang chạy sẽ không mở bản thứ hai. Lỗi tiến trình thử khởi động lại tối đa 5 lượt; không kết thúc Chrome hoặc worker cũ. Log riêng được xoay khi khởi động lại nếu vượt 5MiB, giữ một bản trước; nằm tại `%LOCALAPPDATA%\KBL-New\worker-ID\worker-console.log`.

`CHAY_NEN.cmd` không mở browser. Chrome phải còn chạy để điều khiển chatbox; tính năng ẩn chỉ dùng cửa sổ đã xác minh, không đóng hoặc di chuyển tab khác. Để đăng nhập lại, bấm mở đúng tài khoản trong Admin/local. Đóng trang cấu hình không dừng worker. Bỏ shortcut tự khởi động không xóa ledger, ảnh, video hoặc phiên Chrome.

Nếu lỗi dùng `BAT_DAU.cmd` để xem rõ. Không bật bộ điều khiển cũ và mới cùng nhận việc trong một hồ sơ. Giữ folder cố định sau khi cài shortcut; khi chuyển folder, cài lại shortcut.

## Bằng chứng kiểm tra

Có kiểm thử cấu hình không lộ token, lập lệnh startup không shell interpolation, bridge restart/lease/ACK, PNG/JPEG contract, POS outbox và render FFmpeg fixture. Chưa dùng kết quả test để khẳng định Google/AI/TTS/Windows thật hoặc bài đăng thật đã thành công. Các script PowerShell/VBS cần kiểm tra trên máy Windows người dùng khi triển khai.

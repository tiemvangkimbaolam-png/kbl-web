# Đồng bộ nút đọc lại — 04/11/2026

Các nút Mặt trước, Mặt sau, Đọc QR dùng cùng lớp btn btn-blue như nút Chụp bằng ĐT; nút Dừng đọc dùng btn btn-outline. Lấy màu nâu đồng/chữ trắng, bo góc và bóng đổ từ giao diện POS hiện có, bỏ màu/viền/phông riêng. Giữ nhãn ngắn và chiều cao 32px để nằm cạnh QR ở tab1/2/4.

Chỉ phần trình bày trong kbl-identity-recovery.cjs thay đổi. Hàng đợi đọc giữ nguyên từng byte; so sánh cú pháp chứng minh callback, trạng thái disabled, retry/cancel không đổi.13 kiểm tra liên quan đạt. Bản thử trình duyệt dùng mô-đun thật và CSS thực tế xác nhận cả ba tab cùng hàng cả lúc thường/đang đọc; dừng đọc và đọc QR hoạt động. Bản thử không dùng dữ liệu khách và không phải ảnh cửa sổ POS thật. Không gửi ảnh căn cước hoặc gọi AI trong lúc kiểm tra.

Đã cài cùng sáu tệp nhãn vàng 999.9 khi POS không còn chạy, mở lại PID7672. Archive SHA256: `cbe47b71b2fa0641f6caa8cac0ef3c7d6839a7bf30cc806434d2486df970497b`. Bộ OCR/QR/đổi địa chỉ, luồng kết nối, kho/cấu hình và các tệp bảo vệ giữ nguyên hash khi cài; không ghi dữ liệu nghiệp vụ. Nhãn vàng đã qua381 kiểm tra hồi quy trước phần kiểu nút.

Hoàn tác: thoát POS bình thường, chạy work/install-presentation.py --rollback trong workspace. Header/bảy tệp cũ đủ để tái dựng gói trước; đã kiểm tra hash tái dựng khớp50175abd4c5a935cb081cf9cd283c7f6a32991a130f2e38c2603a4cba97e0c67. Không giữ thêm gói ASAR400MB dư sau khi cài.

Nguồn và ZIP đầy đủ lưu cục bộ; chưa đẩy GitHub công khai. Không thay phiên OAuth, worker hoặc tác vụ đăng đang chạy.

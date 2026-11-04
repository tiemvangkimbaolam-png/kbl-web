# Nút đọc lại gọn ở ba tab — 04/11/2026

Theo ảnh chủ tiệm: đưa nút đọc lại sát nút Quét QR VNeID ở tab1 Thu mua, tab2 Bán hàng và tab4 Cầm đồ. Bỏ khung riêng và dòng giải thích; dùng nhãn ngắn Mặt trước / Mặt sau, giữ tên đầy đủ cho trợ năng và khi rê chuột. Nút Dừng cùng nhóm khi đang đọc.

Chỉ sửa `pos-source/kbl-identity-recovery.cjs`, phần dựng nút. Hàng đợi đọc ảnh giữ nguyên từng byte; không đổi thời gian chờ, bộ OCR/QR, nghiệp vụ hoặc dữ liệu.14 kiểm tra liên quan đạt. Bản thử trình duyệt xác nhận cả ba nhóm vừa hàng khi bình thường/đang đọc, dừng hoạt động và nút đọc lại QR xuất hiện đúng chỗ. Bản thử dùng dữ liệu giả lập, không phải ảnh chụp POS thật.

Đã cài khi POS không chạy, mở lại ứng dụng. Archive mới SHA-256 `50175abd4c5a935cb081cf9cd283c7f6a32991a130f2e38c2603a4cba97e0c67`; trước đó `fbe8cf3b074dd6eafd22bb0e5dec4ecd27eb53f4fff9a0587c3c5ce829040d17`. Trình cài xác nhận renderer/pawn/index/main/OCR, bộ đổi địa chỉ, cấu hình, kho và các tệp bảo vệ không đổi.

Hoàn tác cục bộ: thoát POS bình thường, dùng `work/install-identity-compact.py --rollback` trong workspace. Giữ header và mô-đun cũ để tái dựng gói trước. Nguồn GitHub công khai vẫn chờ chủ cho phép đẩy; lượt này chỉ cập nhật trên máy.

# TV: chữ lớn và kéo từng ô — 02/11/2026

Chủ tiệm yêu cầu chữ lớn hơn, giãn khoảng cách và kéo riêng từng giá thay vì kéo cả bảng. Chỉ sửa mẫu TV và trình chỉnh mẫu; không đổi số giá, đơn vị quy đổi, dữ liệu POS, AI hoặc nghiệp vụ bán hàng/cầm đồ.

Mẫu lưu thêm 12 ô riêng cho ba tiêu đề và loại vàng/mua/bán của 999.9, 980, 610. Mỗi ô có tọa độ, kích thước, ẩn/khóa và kiểu chữ riêng. Mẫu cũ được dựng ô theo đúng bố cục cũ khi đọc, không tự ghi hoặc xóa nội dung, màu, logo/lớp. Vẫn dùng schema 1 và các trường mới mặc định rỗng; chỉ cho khóa ô đã định nghĩa, không nhận giá từ trình chỉnh. Lưu có kiểm tra phiên bản để chặn cửa sổ cũ ghi đè.

Kéo một ô chỉ di chuyển ô đó. Chọn Bảng giá để di chuyển hoặc đổi kích thước toàn bảng cùng các ô. Các phím mũi tên, hoàn tác/làm lại và lưu vẫn dùng được. Bộ điều khiển cỡ chữ của một ô không đổi kiểu chữ ô khác.

Nút “Chữ lớn · giãn cột” giữ phần tên tiệm/địa chỉ, màu và lớp trang trí; áp dụng cỡ tối thiểu 94 cho giá, 84 cho loại vàng, 58 cho tiêu đề. Khoảng cách hình học giữa hai ô mua/bán là 52 px trong khung 1600×900. Đơn vị vẫn ghi ở tiêu đề, ẩn ký hiệu đồng lặp sau từng giá để dành chỗ cho số. Số dài tự co vừa trong ô và không đổi giá trị.

Kiểm chứng:

- 331/331 bài kiểm thử hệ thống đạt, build Cloudflare đạt. Các tệp TV thay đổi không có lỗi TypeScript; toàn dự án còn năm lỗi cũ ở social-connections/Remotion.
- API với SQLite thử kiểm tra lưu/tải tọa độ và kiểu chữ riêng, từ chối sửa đồng thời, dữ liệu giá client, khóa ô không hợp lệ và tràn khung.
- Trình duyệt chạy đúng TVEditor/TVBoard với API local và giá mẫu: kéo ô mua 999.9 từ (506,401) sang (454,375), 11 ô khác không đổi; hoàn tác khôi phục. Kéo tay nắm bên phải đổi rộng 500→535 trong khi X/Y không đổi. Chỉnh cỡ 100 của một ô giữ ô bán cạnh bên ở 94. Các phép thử này không ghi lên máy chủ cửa hàng.
- Kiểm tra triển khai, lưu mẫu thật và giá live được bổ sung trong bàn giao sau khi áp dụng.

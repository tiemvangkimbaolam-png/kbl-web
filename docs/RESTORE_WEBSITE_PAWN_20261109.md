# Tiếp tục website cũ và sửa tên chủ thể ở Chuộc mất giấy — 09/11/2026

## Phạm vi giữ nguyên
- Trang chủ mới giữ nguyên tuyến dữ liệu giá tiệm/POS, kết quả bảng giá, sản phẩm đã chốt, giỏ, tài khoản, xác minh và phản hồi AI.
- Chỉ bổ sung nội dung đã có từ website cũ: giá thế giới XAU/USD cùng dòng, USD Vietcombank, liên kết biểu đồ, thanh danh mục bám cuộn, các tiện ích/điều hướng còn thiếu, tin tức có nguồn, FAQ, video giới thiệu chỉ tải khi mở, chân trang theo mẫu cũ, nút chat AI/làm mới/lên đầu.
- Không sinh giá/sản phẩm/bản tin giả. Nguồn thị trường chỉ đọc `/api/public/market`, `/api/public/fx`; tin lấy từ bài đã công bố. Nút làm mới chỉ yêu cầu lại GET đang có.
- Phần website bán vàng giữ thương hiệu và chân trang đã được chủ duyệt, không đổi pháp nhân bán vàng một cách suy đoán.

## Chuộc mất giấy
- Chỉ phần **biên bản xác nhận mất phiếu cầm** ở `pos-source/renderer.js` và `pos-source/pawn-pro-addon.js` hiện **HỘ KINH DOANH CẦM ĐỒ NGUYỄN VĂN LÂM**.
- Xóa MST 3703496362 của đơn vị vàng khỏi riêng mẫu biên bản mất phiếu; không tự gán MST khác vì chưa có bằng chứng.
- Không để `data-shop-field="companyName"` ghi đè tên hộ kinh doanh từ cấu hình tiệm ở bản in phụ.
- Không sửa phiếu cầm liên 1/liên 2 đã chốt, công thức tính tiền, các biểu mẫu bán/đổi, hàng tồn, dữ liệu khách, quy trình xác minh hoặc bản ghi đã lưu.
- Giữ lại hashes nguồn POS gốc trong `pos-source/LATEST_SOURCE_PROVENANCE.json`; bổ sung `presentationPatches20261109` chỉ cho hai tệp trình bày.

## Kiểm tra và giới hạn
- Kiểm tra tĩnh 13 điều kiện tại nguồn: đủ nhãn hộ kinh doanh trên cả hai đường in, không lẫn pháp nhân/MST vàng, giữ nút nổi, phần chân trang, nguồn giá thật, chỉ một dòng XAU, và thanh danh mục.
- Bổ sung `tests/website-legacy-pawn-issuer.test.mjs` cùng kiểm tra hash patch trong `tests/pos-source.test.mjs`. **Các bài này chưa chạy Node trong phiên kết nối GitHub**, chưa build Cloudflare / TypeScript, chưa mở bản chạy localhost bằng trình duyệt, chưa thử in A4 trên POS thật.
- Bản sửa ở nhánh riêng, chỉ tạo PR nháp. Chưa gộp, chưa cài trên Windows, chưa deploy Cloudflare, không thay DNS hoặc cơ sở dữ liệu. Chỉ triển khai sau kiểm thử và so sánh bố cục thực tế với các ảnh đã duyệt.

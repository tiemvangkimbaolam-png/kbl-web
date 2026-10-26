# KBL mới — phạm vi bảo trì

- Website và worker là dự án mới. Không sửa/xóa bộ cũ, không sao chép hồ sơ Chrome, cookie, token, dữ liệu cá nhân hoặc ZIP worker gốc vào source/Git/hosting.
- POS chỉ là nguồn đọc. Không thay công thức, phiếu hay dữ liệu POS từ website. Chỉ áp dụng snapshot đầy đủ, nguyên tử và có hạn mức.
- Không công bố giá/tin/sản phẩm giả để lấp chỗ trống. Dữ liệu thử chỉ ở tests và database thử.
- Duyệt độc lập, nguồn có bằng chứng, file có hash, lease và biên nhận. Giữ kết quả chưa rõ trạng thái; chỉ chuyển tự động khi chưa gửi có bằng chứng hoặc kết quả đã bị từ chối rõ ràng.
- Bảo vệ ảnh sản phẩm/bài đang dùng. Chỉ dọn video tạm khi đủ biên nhận kênh yêu cầu. Không sinh backup đầy hosting.
- Giữ auth Sites, OWNER_EMAIL và token worker. Không ghi secrets vào source, manifest, log hoặc đầu ra.
- Migrations đã áp dụng không được sửa. Thêm migration mới.
- Đọc docs/CONTRACTS.md và docs/VERIFICATION.md trước khi đổi giao thức. Kiểm thử meaningful gồm API, mất kết nối, idempotency, private dữ liệu và quota; phân biệt mô phỏng với thật.

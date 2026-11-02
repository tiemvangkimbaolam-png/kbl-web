# D1: giảm lượt đọc — 02/11/2026

Cloudflare Free chặn truy vấn khi tổng tài khoản vượt 5 triệu dòng đọc/ngày;
hạn mức mở lại lúc 00:00 UTC (07:00 Việt Nam). Không phải dữ liệu bị xóa.
Xem D1 > database > Metrics / Insights để xác định truy vấn thực tế chiếm nhiều nhất;
biểu đồ Workers Invocations không phải số dòng D1 đã đọc.

## Thay đổi

- TV đọc `/api/public/prices?view=tv`, giữ tên/địa chỉ/điện thoại công khai,
  không tải tối đa 500 sản phẩm mỗi 30 giây.
- Trang bảng giá riêng cũng dùng API chỉ có giá.
- Khi xem biểu đồ thế giới, không tải lịch sử D1 không được sử dụng.
  Biểu đồ Việt Nam dùng `price-history?days=7&series=vn`: chỉ các mốc ngày của tiệm.
  API bỏ tham số series vẫn trả cả hai nhóm để tương thích bên đang dùng.
- TV, Admin và lịch sử không tự quét khi tab bị ẩn.
- Migration `0003_read_budget_indexes.sql` thêm index theo kind/ngày và hash
  quyền widget. Không sửa/xóa bản ghi, công thức POS hay migration đã áp dụng.

## Áp dụng

Chỉ đích `kbl-web-moi`, DB `kbl-web-moi-db` trong wrangler.cloudflare.json.
Không thao tác `kbl-backup`. Không cần đổi gói Cloudflare hoặc đưa bí mật vào Git.

Sau khi kéo source mới và đăng nhập Wrangler trên máy của chủ:

```sh
npm run build:cloudflare
npm run deploy:cloudflare
```

Helper deploy áp dụng migrations vào DB mới trước khi triển khai Worker.
Nếu dùng Cloudflare Git builds chỉ build/deploy Worker, phải áp dụng index riêng:

```sh
npx wrangler d1 migrations apply DB --remote --config wrangler.cloudflare.json
```

Hoặc chạy hai lệnh CREATE INDEX của migration trong Console của đúng database.
Các lệnh có IF NOT EXISTS; không chạy lại migration cũ theo cách thủ công.
Index mới cần đọc dữ liệu hiện có một lần để tạo, nên áp dụng khi hạn mức đã mở.

## Kiểm chứng và giới hạn

Kiểm thử dùng SQLite thật với dữ liệu giả lập, API ứng dụng thật và TSX effects
với hooks/transport giả lập. EXPLAIN QUERY PLAN phải dùng index range/lookup.
Đây không phải số rows_read đo trên D1 production, không phải thử iPhone thật.
Luồng sửa tên/số chỉ mục tiêu đã kiểm tra: cùng token đang ghép đọc được bản mới
ở lần GET kế tiếp, không cần chép lại script chỉ vì đổi mục tiêu. iOS quyết định
lịch làm mới widget; website không ép màn hình chính cập nhật tức thì.

Ở thời điểm chẩn đoán, API production đã trả HTTP 200 nhưng bảng giá còn stale;
`cloudPrice.lastError` báo Google Relay chưa cung cấp kết quả BK hợp lệ.
Giảm D1 không sửa được dữ liệu/triển khai Apps Script bên ngoài. Phải kiểm tra
Relay bằng source do chủ cung cấp hoặc quyền truy cập riêng; không đoán giá,
không bỏ xác thực, không nhận kết quả lỗi thành giá mới.

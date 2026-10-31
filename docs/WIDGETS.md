# Widget giá vàng KBL — Hồng đào vàng đồng

Website có liên kết `/widget`, chuyển tới `/tien-ich/widget-kbl/index.html`. Khách cài Scriptable miễn phí từ App Store, bấm **Sao chép mã widget**, mở `scriptable:///add` (hoặc Scriptable → dấu +), dán toàn bộ mã vào editor, đặt tên **KBL Gia Vang Dong**, xem thử bằng ▶ và lưu. Sau đó thêm widget Scriptable nhỏ/vừa/lớn và chọn script đó.

Ảnh thiết bị người dùng ngày 01/11 báo “The UTI of the file is not supported” với luồng chia sẻ tệp .scriptable. Không suy ra nguyên nhân MIME/đuôi tệp chính xác từ ảnh. Luồng chính đã bỏ bước nhập/chia sẻ tệp, chỉ sao chép mã JavaScript. Trang tải sẵn mã trước click để không mất user gesture trên Safari, kiểm tra SHA-256/độ dài/định danh với manifest sinh từ cùng source; fallback textarea cho chọn tất cả và sao chép thủ công. Chưa xác nhận native iPhone sau sửa.

Tệp .js là tùy chọn cho người dùng đã bật iCloud: lưu vào iCloud Drive/Scriptable. Không hướng dẫn chia sẻ lại .scriptable nếu gặp UTI. File bundle cũ chỉ giữ tương thích liên kết đã phát hành; không còn là luồng cài chính.

Gói tự chứa mã, logo thật và nền hồng đào. Không cần Apple Developer hoặc thuê bao KBL. Widget nhỏ có giá 999.9; vừa/lớn có 999.9, 980, 610 nếu được tiệm công bố. Chạm widget mở bảng giá website. iOS quyết định thời điểm cập nhật; không bảo đảm từng giây. Để giữ màu mẫu, dùng cách hiển thị màu nguyên bản trên iPhone thay vì tô màu toàn bộ icon/widget.

Dữ liệu: chỉ GET HTTPS `https://tiemvangkimbaolam.id.vn/api/public/catalog`, kiểm tra mã HTTP/nguồn redirect/schema/đơn vị/thời gian; sử dụng giá mua/bán công bố, không tính lại biên lợi nhuận hoặc sửa POS. Đơn vị đồng/lượng cũ chia 10 khi hiển thị đồng/chỉ, đồng nhất với website. Chỉ lưu các dòng giá đã kiểm tra trong file cache riêng của Scriptable, không lưu danh mục sản phẩm. Lỗi mạng/giá quá 30 phút: ghi BẢN LƯU. Quá 24 giờ: không hiện số. Không đăng nhập, không token POS, không danh bạ/ảnh/vị trí, không tải hay thực thi mã từ xa.

Nguồn chuẩn: `lib/kbl/widget-core.mjs`, `scripts/scriptable-widget.template.js`. Chạy `node scripts/build-kbl-widgets.mjs` sau khi sửa nguồn; commit cả tệp sinh trong public. Logo/nền đã nhúng, không phụ thuộc CDN. Trang cài dùng cùng parser và chỉ nhận JSON cùng nguồn. Phần bảng giá/brand/CTA/nút nổi của website đổi trình bày bằng CSS scoped; giữ dữ liệu và các tính năng cũ.

Kiểm tra: `node --test tests/widgets.test.mjs tests/reference-home.test.mjs tests/cloud-price.test.mjs tests/customer-experience.test.mjs tests/price-handoff.test.mjs tests/ui-recovery.test.mjs`; `node scripts/cloudflare.mjs build`. Scriptable được chạy bằng native API mock trong Node, chưa phải kiểm thử trên iPhone thật. Các khung xem trước web không phải ảnh chụp widget native. Khi đóng gói hoặc deploy không đưa fixture, database thử, secret hoặc ảnh kiểm tra vào public.

Tham khảo API chính thức: https://docs.scriptable.app/listwidget/ ; https://docs.scriptable.app/widgetstack/ ; https://docs.scriptable.app/font/ .

Cứu hộ khi trang cài chưa deploy: sao chép `KBL_Cai_Widget.txt` vào script mới trong ứng dụng và chạy. Bộ cài chỉ đọc JavaScript từ commit GitHub 734be73… cố định qua HTTPS, không chấp nhận redirect, kiểm tra HTTP/độ dài/header, lưu bằng FileManager vào thư mục script và mở editor. Không eval/importModule hay chạy script tải về; không ghi đè script đã có, tự chọn tên khác và báo tên để chọn trong widget. Kiểm tra độ dài/header là kiểm tra đầy đủ dữ liệu, không được mô tả là SHA-256. Luồng copy trên website kiểm tra SHA-256.

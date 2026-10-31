# Widget giá vàng KBL — Hồng đào vàng đồng

Website có liên kết `/widget`, chuyển tới `/tien-ich/widget-kbl/index.html`. Khách cài Scriptable miễn phí từ App Store, tải tệp `KBL_Gia_Vang_Dong.scriptable`, chia sẻ tệp sang Scriptable, rồi thêm widget Scriptable nhỏ/vừa/lớn và chọn script **KBL Gia Vang Dong**.

Gói tự chứa mã, logo thật và nền hồng đào. Không cần Apple Developer hoặc thuê bao KBL. Widget nhỏ có giá 999.9; vừa/lớn có 999.9, 980, 610 nếu được tiệm công bố. Chạm widget mở bảng giá website. iOS quyết định thời điểm cập nhật; không bảo đảm từng giây. Để giữ màu mẫu, dùng cách hiển thị màu nguyên bản trên iPhone thay vì tô màu toàn bộ icon/widget.

Dữ liệu: chỉ GET HTTPS `https://tiemvangkimbaolam.id.vn/api/public/catalog`, kiểm tra mã HTTP/nguồn redirect/schema/đơn vị/thời gian; sử dụng giá mua/bán công bố, không tính lại biên lợi nhuận hoặc sửa POS. Đơn vị đồng/lượng cũ chia 10 khi hiển thị đồng/chỉ, đồng nhất với website. Chỉ lưu các dòng giá đã kiểm tra trong file cache riêng của Scriptable, không lưu danh mục sản phẩm. Lỗi mạng/giá quá 30 phút: ghi BẢN LƯU. Quá 24 giờ: không hiện số. Không đăng nhập, không token POS, không danh bạ/ảnh/vị trí, không tải hay thực thi mã từ xa.

Nguồn chuẩn: `lib/kbl/widget-core.mjs`, `scripts/scriptable-widget.template.js`. Chạy `node scripts/build-kbl-widgets.mjs` sau khi sửa nguồn; commit cả tệp sinh trong public. Logo/nền đã nhúng, không phụ thuộc CDN. Trang cài dùng cùng parser và chỉ nhận JSON cùng nguồn. Phần bảng giá/brand/CTA/nút nổi của website đổi trình bày bằng CSS scoped; giữ dữ liệu và các tính năng cũ.

Kiểm tra: `node --test tests/widgets.test.mjs tests/reference-home.test.mjs tests/cloud-price.test.mjs tests/customer-experience.test.mjs tests/price-handoff.test.mjs tests/ui-recovery.test.mjs`; `node scripts/cloudflare.mjs build`. Scriptable được chạy bằng native API mock trong Node, chưa phải kiểm thử trên iPhone thật. Các khung xem trước web không phải ảnh chụp widget native. Khi đóng gói hoặc deploy không đưa fixture, database thử, secret hoặc ảnh kiểm tra vào public.

Tham khảo API chính thức: https://docs.scriptable.app/listwidget/ ; https://docs.scriptable.app/widgetstack/ ; https://docs.scriptable.app/font/ .

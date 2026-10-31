# KBL — mẫu 06 đã chọn

Nguồn: branch kbl-web-moi, base 7254c6e388d591c54481a9fd711ff0b0eaf7e47c.
Tham chiếu được duyệt: image-edit-target-a521aed9885ffa3e.png, mẫu 06 Hồng đào vàng đồng.

- Nền trắng, hồng đào rất nhạt; chữ xanh đậm; thương hiệu và giá bán màu đồng, nét viền mảnh, chữ lớn.
- Website giữ sản phẩm, tìm kiếm, giỏ hàng, thử trang sức, lịch sử giá, AI, ngôn ngữ và chuyển đổi hiển thị tiền tệ.
- Nút cài widget miễn phí dẫn tới hướng dẫn Scriptable, hỗ trợ nhỏ/vừa/lớn. Lấy giá công khai của chính KBL; không hard-code giá minh họa, không đổi công thức hay giá cộng của POS.
- Làm mới dưới logo AI; mũi tên về đầu trang.
- Kiểm tra parser, lỗi mạng/cache, thực thi Scriptable bằng mock API; build Cloudflare; trình duyệt 320/375/414/768/desktop. iPhone/Scriptable thật chưa có thiết bị kiểm tra.
- Bàn giao GitHub branch/PR và gói cập nhật gọn nếu cần. Không đổi DNS, migrations, dữ liệu hay công khai secrets.

SHA256 ảnh mẫu đã chọn: 4023986244cb2bf058a8aa814c30e6c47d77f977f67084065a8fa642946cb601.

01/11/2026: người dùng cung cấp ảnh lỗi UTI lúc chia sẻ gói Scriptable. Được phép sửa luồng cài, giữ mẫu 06 và giá/POS. Thay bằng sao chép mã → editor mới, thêm fallback thủ công, kiểm tra hash mã, và cung cấp đoạn cài ngắn gắn commit cố định cho trường hợp cứu hộ. Không khẳng định đã kiểm tra iPhone thật hoặc đã deploy khi chưa có bằng chứng.

Căn bảng giá mobile: khoảng hở 12px của grid cũ cộng thêm trên tổng 100% bề rộng ba cột đẩy giá bán vượt mép phải. Bỏ khoảng hở thừa và chừa thêm 6px bên phải ở cả tiêu đề/các dòng; không đổi giá, cỡ chữ hay công thức. Kiểm tra mép chữ thay vì chỉ bề rộng khung.

01/11/2026 — Vàng của tôi: người dùng cho phép làm trước bảng theo dõi vàng sở hữu riêng theo tài khoản, giao dịch mua/bán tự nhập, lãi/lỗ VND và % theo giá mua vào, mũi tên và đồ thị từ mốc giá thật; widget Scriptable riêng nhỏ/vừa/lớn, ghép một lần và thu hồi được. Giữ mẫu 06, chữ dễ đọc và widget bảng giá hiện có. Không nối/ghi dữ liệu POS, không sinh giá hay đường tăng giả. Dùng records hiện có, không sửa migration/schema. Mã widget chỉ đọc tóm tắt, token trong Keychain, không đưa token vào URL/log. Không hứa chạy khi người dùng đi ngủ; hoàn tất trong lượt hoạt động và báo rõ phần chưa kiểm tra thiết bị/deploy.

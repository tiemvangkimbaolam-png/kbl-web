# Giá tiệm tự cập nhật khi Windows/POS tắt

Đã phục hồi bộ BK/ASK server từ app.js Tenten commit6f68320: quy đổi ASK floor(ASK)/10 lấy phần nguyên rồi nhân1000, cộng mức POS cấu hình, làm tròn9999 theo1000đ; các tuổi khác theo effective9850/7650/6220/6000/4300 và làm tròn10000đ. Chênh lệch mua/bán lấy đủ sáu giá trị POS đang dùng. Không suy giá tiệm từ XAU/USD thế giới, không đổi công thức POS và không ghi ngược POS.

## Làm một lần

1. Cloudflare → Worker kbl-web-moi → Settings → Variables and Secrets. Nếu đã có KBL_PRICE_ENCRYPTION_KEY hoặc KBL_SOCIAL_ENCRYPTION_KEY64hex đang dùng thì giữ nguyên. Nếu chưa có: chạy TAO_KHOA_GIA_CLOUD.cmd trong bộ Windows mới; khóa được sao chép vào clipboard, không in ra. Add → Secret → tên KBL_PRICE_ENCRYPTION_KEY → dán giá trị → Deploy. Không gửi khóa vào chat và không thay khóa sau khi đã lưu cấu hình mã hóa.
2. Cập nhật bộ Windows từ public/downloads/KBL-WINDOWS-2.zip, giải nén chép code vào thư mục KBL_WINDOWS_MOI hiện tại; giữ kbl-config.json và dữ liệu POS. Thoát POS và khởi động lại worker/máy sau cập nhật, không kết thúc tất cả node.exe đang chạy. Nếu có việc AI/video đang làm, chờ việc xong trước bảo trì.
3. Mở POS một lần: bật nguồn giá Google, kiểm tra đúng mức cộng/6chênh lệch/RelayURL/mã đang dùng rồi LƯU. Workerlocal chọn đúng data POS; mỗi phút tự đọc và bàn giao cấu hình qua mã worker. Không chép settings.json hoặc token lên GitHub. POS cũ có thể gửi cloud-price-config trực tiếp qua relaylocal; worker bổ sung spread từ dữ liệu thực, không lấy giá mặc định đoán.
4. Admin → Kết nối → Giá tự động trên Cloudflare: bấm Kiểm tra nguồn ngay. Chỉ sau khi có thời điểm đọc nguồn thành công, không lỗi và không thiếu cấu hình mới thử tắt Windows. Chờ qua chu kỳ rồi dùng điện thoại kiểm tra thời điểm mới. Cài code/deploy thành công chưa chứng minh Relay thật đã phản hồi.

## Khi vận hành

Cron Cloudflare mỗi phút, đọc trang web định kỳ nữa có thể làm thời điểm hiển thị chậm thêm một nhịp. Không phải feed theo từng giây. Nguồn không có observedAt thì chỉ ghi fetchedAt/thời điểm tải, không bịa thời điểm giá nguồn.

Mất nguồn, HTML, JSON lỗi, saiBK, redirectlạ, quátimeout/body hoặc lệch hơn35% so với giá đang có: giữ snapshotcloud cuối và báo giá cũ. Không tự đặt0. POSđangbật vẫn gửi bản chụp gốc riêng; Cloudflare không thay POS/settings/mua bán.

Cấu hình/token được mã hóa trong bản ghi riêng, không xuất public/catalog/export. Mất khóa mã hóa giữ giá cloud cũ có nhãn stale; cần khôi phục khóa hoặc bàn giao lại cấu hình. Không xóa dữ liệu để chữa lỗi. AI/video chạy local vẫn cần Windows, độc lập với bộ giá server.

Cấu hình nâng cao bằng Secrets: KBL_GOOGLE_RELAY_URL/TOKEN, KBL_GOOGLE_PRICE_MARKUP_VND và KBL_GOOGLE_PRICE_SPREADS_JSON đủ6mã; không có đủ tham số thì chờ cấu hình, không đoán giá tiệm. Ưu tiên cách bàn giao từ POS.

# Mẫu 06 — kết quả kiểm tra

- 60 bài kiểm thử phù hợp đã đạt, gồm giá/công thức hiển thị, native Scriptable với mock API, cache/mất mạng, nguồn redirect, package tự chứa và các luồng hiện có.
- Build Cloudflare/Vinext thành công. Không thay dependency hay migration.
- Browser: dùng template/CSS/layout thật trong harness riêng ngoài repo; các giá trong harness là bản chụp API công khai KBL, không đưa vào public source. Giá không tràn ở 320/375/414/768px. Cỡ lớn preview 320px đã sửa tràn. Preview nhỏ/vừa/lớn đổi đúng.
- Nút làm mới: bộ đếm tải trang từ 13 lên 14 sau click. Mũi tên: vùng giá từ tọa độ -704px trở về đầu, thương hiệu ở 0px. Reload dưới AI, mũi tên cùng bên phải.
- Chưa kiểm thử thiết bị iPhone/Scriptable thật. Browser download API và đường HTTP localhost từ shell timeout; không dùng kết quả đó làm bằng chứng tải thành công. Package JSON/mã và tệp link đã kiểm tra trực tiếp trên filesystem.
- Wrangler whoami: chưa đăng nhập Cloudflare ở môi trường này. Chưa xác nhận deploy website thật.
- Typecheck toàn repo trước đó có lỗi không thuộc thay đổi ở social-connections và windows/remotion; không sửa ngoài phạm vi này.

## Sửa lỗi sau ảnh iPhone — 01/11/2026
- Loại bỏ share `.scriptable` khỏi đường cài chính sau lỗi UTI trên máy người dùng; chưa kết luận MIME hay app gây lỗi. Mã được tải trước, xác minh SHA-256 rồi sao chép ngay trong thao tác bấm. Có vùng mã thủ công và nút mở editor Scriptable.
- 69 kiểm thử đạt: mã đầy đủ/hash, HTTP lỗi/tệp giả/partial, clipboard thành công và bị từ chối (VM chạy page.js thật), cứu hộ pin commit, không ghi đè script cũ; cùng các kiểm thử giá và UI hiện có. Đây là mô phỏng, chưa xác minh iPhone thật.
- Mã native pin commit 734be73 có Git blob 08370b01fc9ef291860528b81dc54f16a9d89baf, trùng file local; bộ cài cứu hộ chỉ lưu mã và mở editor, không tự chạy mã tải về.
- Bản build Cloudflare mới thành công. Browser dùng template/CSS thật trong harness ngoài repo, bản chụp giá công khai 31/10; 320/375/393/414/768 px không tràn cột mua/bán, mép phải chữ cách viền tối thiểu 19 px. Bỏ column-gap cũ, chừa thêm 6 px bên phải; giữ cỡ chữ và giá.
- Browser preview HTTP không có WebCrypto nên khóa nút sao chép và yêu cầu HTTPS đúng thiết kế. Luồng clipboard thành công/fallback đã kiểm tra bằng VM, chưa kiểm tra Safari thật.
- Production deploy còn open: Wrangler chưa đăng nhập; lần xác thực Cloudflare trước đã bị người dùng hủy. Không đổi database, DNS hoặc quyền truy cập.

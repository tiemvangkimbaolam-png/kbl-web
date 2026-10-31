# Mẫu 06 — kết quả kiểm tra

- 60 bài kiểm thử phù hợp đã đạt, gồm giá/công thức hiển thị, native Scriptable với mock API, cache/mất mạng, nguồn redirect, package tự chứa và các luồng hiện có.
- Build Cloudflare/Vinext thành công. Không thay dependency hay migration.
- Browser: dùng template/CSS/layout thật trong harness riêng ngoài repo; các giá trong harness là bản chụp API công khai KBL, không đưa vào public source. Giá không tràn ở 320/375/414/768px. Cỡ lớn preview 320px đã sửa tràn. Preview nhỏ/vừa/lớn đổi đúng.
- Nút làm mới: bộ đếm tải trang từ 13 lên 14 sau click. Mũi tên: vùng giá từ tọa độ -704px trở về đầu, thương hiệu ở 0px. Reload dưới AI, mũi tên cùng bên phải.
- Chưa kiểm thử thiết bị iPhone/Scriptable thật. Browser download API và đường HTTP localhost từ shell timeout; không dùng kết quả đó làm bằng chứng tải thành công. Package JSON/mã và tệp link đã kiểm tra trực tiếp trên filesystem.
- Wrangler whoami: chưa đăng nhập Cloudflare ở môi trường này. Chưa xác nhận deploy website thật.
- Typecheck toàn repo trước đó có lỗi không thuộc thay đổi ở social-connections và windows/remotion; không sửa ngoài phạm vi này.

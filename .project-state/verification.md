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

## Vàng của tôi — 01/11/2026
- Thêm sổ khách tự nhập riêng từng session, mua/bán/sửa/xóa, vốn bình quân di động bằng BigInt/đơn vị 0,001 chỉ; tách lãi đã bán và lãi tạm tính/% của phần đang giữ theo giá tiệm mua vào. Không thay POS.
- API thật bundle chạy SQLite thật trong fixture: example 2 chỉ/vốn15m/giá trị40m/lãi25m/166,67%; vàng nhiều loại, bán một phần/toàn bộ, lỗ, số lẻ và rounding, từ chối quá tồn, sửa/xóa làm âm tồn, optimistic concurrency và idempotency. Kiểm tra cách ly tài khoản, chống origin khác, token không được ghi sổ, mã ghép một lần, hash-only, thu hồi/mã mới/reset mật khẩu/hết hạn.
- Widget native riêng nhỏ/vừa/lớn đã thực thi file sinh ra trong VM Scriptable mock: chữ/số/%, hướng tăng/giảm, Path/DrawContext được gọi, ẩn số liệu, mất mạng và thu hồi không dùng cache riêng tư; token chỉ ở Keychain, HTTPS không redirect, không token URL. Đây chưa phải iPhone thật.
- Browser module HTML/CSS/JS thật trong harness riêng ngoài repo với API fixture có nhãn rõ, không đăng nhập giả vào production: không tràn body tại 320/393/768/1160px; đường zigzag thực sự thấy được. Đã thử ẩn/hiện, thêm0,5chỉ/8m ->2,5chỉ/vốn23m/lãi27m; sửa8m->6m ->vốn21m/lãi29m; bán0,5chỉ/5m ->2chỉ/vốn16,8m/lãiđãbán0,8m. Giá/giao dịch đó là fixture, không tài sản thật.
- Build Cloudflare thành công. Không đổi migration/schema/dependency, auth hiện có, cấu hình hay secrets. Production chưa triển khai do chưa có phiên Cloudflare; Safari clipboard/Keychain widget giữa app và màn hình thật chưa kiểm tra. iOS có thể giữ ảnh widget cũ đến lần làm mới dù token đã thu hồi.
- Tổng lượt kiểm thử phù hợp cuối cùng: 88/88 đạt. Typecheck không còn lỗi trong file thay đổi mới; toàn repo còn lỗi có sẵn ở social-connections và windows/remotion, chưa sửa ngoài phạm vi. Build mới nhất exit 0.


02/11/2026: 308/308 tests pass after snapshot-card/anonymous-void changes. Actual FFmpeg video 1080x1920, 20 seconds; actual HoaiMy speech with word-boundaries. Desktop browser inspected POS screen-only theme on stripped offline preview. Protected POS financial code hashes unchanged. Worker 2.2.1 actual local health, fresh POS sync and zero pending observed. Source build Cloudflare passed. Full tsc has pre-existing social-connections currentUrl error and missing standalone Remotion types; not claimed passing. Live anonymous invoice proof read-only validated; no production invoice void sent. AI Chrome pairing, correct three-product photo set and social publication receipts remain open.

Specialist routing: 311/311 tests pass, including preferred model selection, offline/busy fallback and preserving an existing lease. Cloudflare build passed after adding the opt-in owner setting/UI. Full tsc retains only the same five existing errors. First deployment 3f3dfbf successful; loopback cutover authenticated with existing POS token, invalid nonexistent-invoice probe returns 409 before mutation. No real invoice void sent. All protected financial source hashes still match. Admin configuration is blocked on actual Cloudflare Access sign-in; link supplied to owner.

02/11/2026 11:38 Vietnam: owner Access sign-in verified in browser. Specialist routing checked and saved through actual Admin. Existing Gemini enabled; DeepSeek, Claude, ChatGPT, Grok metadata added and assigned to the current live worker. Actual UI reports five accounts and zero Chrome connections; browser logins/extension pairing pending owner action. No claims of live AI publishing. Deployment db46f54 target kbl-web-moi success verified through GitHub check API; unrelated kbl-backup check failure recorded. Six protected POS source hashes rechecked unchanged. Old Tenten pollers still return 404, left running pending safe cutover; no jobs or Chrome profiles deleted.
